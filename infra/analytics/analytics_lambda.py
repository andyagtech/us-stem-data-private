"""Analytics for phd-demographics: collect events, serve the dashboard.

  POST /collect    one event from the beacon
  GET  /analytics  the dashboard's aggregates (password-protected)

Three faults, all found on 2026-09-12 before the site's traffic arrived, and
all fixed here.

1. THE DASHBOARD UNDERCOUNTED SILENTLY ABOVE ~2,400 EVENTS A DAY. It read every
   raw event with one query per day and never followed DynamoDB's pagination
   cursor, so it saw the first 1 MB of each day and no more. The busiest day so
   far was 301 events, so it had never shown -- and the first day it mattered
   would have been the day the number was quoted. Every event now also updates
   a DAILY ROLLUP, and the dashboard reads those: at most one small row per day
   per site, so the totals are exact and the read is bounded whatever the
   traffic. Raw events are still written, and are read only for the recent-
   sessions list, one day at a time and capped.

2. COUNTRY NEVER WORKED. It was read from `cloudfront-viewer-country`, but this
   endpoint is API Gateway, not CloudFront, so the header never arrived: zero of
   1,088 events carried a country and the dashboard's country and city charts
   had been empty since July. The country now comes from the IP, through a table
   built from the regional registries' own delegation files
   (scripts/build_ip_country_table.py). It is the country a block was ALLOCATED
   to: a VPN or a cloud region reads as its allocation country, so the figures
   say "allocated to", not "visitors from". The registries publish no cities, so
   the city chart is gone; referrers replace it, which is what a traffic spike
   actually raises questions about.

3. BOTS AND TWO SITES WERE POOLED. 805 of the first 1,088 events were this
   project's own headless test runs and 74 were declared crawlers, leaving 205
   real browser visits; and the endpoint is shared with seattle-radicalism,
   whose 198 events were mixed into the same totals. Every event now records
   the site it came from and whether the agent looks automated, the dashboard
   defaults to one site and to humans only, and both can be switched.

Also: an event whose Origin header names a host that is not one of ours is now
refused. A missing Origin is still accepted -- some browsers omit it and losing
a real visitor is worse than storing a junk row.

The full IP is stored deliberately, for geography; nothing here hashes it.
"""
import json
import os
import struct
import time
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "phd-demographics-analytics")
# The chat assistant's spend ledger (cloud/chat/budget.py writes one SPEND:<day>
# row per UTC day). Read here rather than copied here, so the dashboard and the
# ceiling can never disagree about what was spent. A default rather than a
# required variable: this function's environment also holds the password, and
# update-function-configuration replaces the whole environment.
CHAT_SPEND_TABLE = os.environ.get("CHAT_SPEND_TABLE", "phd-chat-ratelimit-prod")
CHAT_SITE = "phd-demographics"     # the only site that carries the assistant
MICRO = 1_000_000
ANALYTICS_PASSWORD = os.environ["ANALYTICS_PASSWORD"]   # required, no default

# Hosts allowed to write. The key is the Origin host; the value is the site
# label the dashboard filters on.
SITES = {
    "phd-demographics.andy-barr.com": "phd-demographics",
    # h1b.andy-barr.com is a SEPARATE SITE that happens to share a bucket and
    # a CloudFront distribution with the pipeline site. Without these two
    # lines its traffic fell through to DEFAULT_SITE and was recorded as
    # phd-demographics -- not missing, which someone would notice, but
    # silently merged into another site's numbers, which nobody would.
    "h1b.andy-barr.com": "h1b",
    "h-1b.andy-barr.com": "h1b",
    "seattle-radicalism.andy-barr.com": "seattle-radicalism",
    "8090.andy-barr.com": "8090-atlas",
    "localhost": "local",
    "127.0.0.1": "local",
}
DEFAULT_SITE = "phd-demographics"

# Rollup and marker rows share the raw events' partition but sort after every
# ISO timestamp, because "@" (0x40) is above every digit. A raw-event query
# therefore ends at "@" and never has to filter them out.
ROLLUP = "@rollup"
SESSION = "@sess"
RETENTION_DAYS = 90
MAX_RECENT_EVENTS = 4000          # cap on the raw read behind recent sessions

BOT_MARKERS = ("bot", "crawl", "spider", "slurp", "headless", "phantom",
               "python-requests", "curl/", "wget", "httpx", "axios",
               "playwright", "puppeteer", "lighthouse", "preview", "monitor")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

_IP_TABLE = None


def _ip_table() -> bytes:
    """The IPv4 -> country table, read once per container."""
    global _IP_TABLE
    if _IP_TABLE is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "ip_country.bin")
        try:
            with open(path, "rb") as fh:
                _IP_TABLE = fh.read()
        except OSError:
            _IP_TABLE = b""
    return _IP_TABLE


def country_of(ip: str) -> str:
    """The country an address was allocated to, or "" if unknown.

    A bisect over 6-byte records: 4-byte range start, 2-byte country. The
    range a lookup lands in runs until the next record begins, and "??" marks
    unallocated space. Mirrors scripts/build_ip_country_table.py, which the
    tests check the two copies against each other.
    """
    blob = _ip_table()
    if not blob or not ip:
        return ""
    parts = ip.split(".")
    if len(parts) != 4:
        return ""                                  # IPv6 or malformed
    try:
        octets = [int(p) for p in parts]
    except ValueError:
        return ""
    if not all(0 <= o <= 255 for o in octets):
        return ""
    n = (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]
    lo, hi = 0, len(blob) // 6
    while lo < hi:
        mid = (lo + hi) // 2
        if struct.unpack_from(">I", blob, mid * 6)[0] <= n:
            lo = mid + 1
        else:
            hi = mid
    if lo == 0:
        return ""
    cc = blob[(lo - 1) * 6 + 4:(lo - 1) * 6 + 6]
    return "" if cc == b"??" else cc.decode()


def looks_automated(ua: str) -> bool:
    """Whether the agent string looks like a crawler or a test run.

    Deliberately generous: a human misfiled as a bot is one lost row, while a
    bot counted as a human moved the headline by a factor of four here.
    """
    if not ua:
        return True                                # no agent string at all
    low = ua.lower()
    return any(m in low for m in BOT_MARKERS)


def host_of(url: str) -> str:
    if not url:
        return ""
    rest = url.split("://", 1)[-1]
    return rest.split("/", 1)[0].split(":")[0].lower()


def response(status, body):
    return {"statusCode": status,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps(body, default=str)}


def handler(event, context=None):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "")
    if method == "OPTIONS":
        return response(200, {})
    if method == "POST" and "/collect" in path:
        return handle_collect(event)
    if method == "GET" and "/analytics" in path:
        return handle_analytics(event)
    return response(404, {"error": "not found"})


# ---------------------------------------------------------------------------
# collect
# ---------------------------------------------------------------------------
def handle_collect(event):
    try:
        body = json.loads(event.get("body") or "{}")
        if not isinstance(body, dict):
            raise ValueError
    except (ValueError, TypeError):
        return response(400, {"error": "invalid json"})

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    origin_host = host_of(headers.get("origin", ""))
    if origin_host and origin_host not in SITES:
        # Someone else's page, or a script pointed at this endpoint.
        return response(403, {"error": "origin not allowed"})
    site = SITES.get(origin_host) or SITES.get(host_of(headers.get("referer", ""))) \
        or DEFAULT_SITE

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    ts = now.isoformat().replace("+00:00", "Z")
    ip = (event.get("requestContext", {}).get("http", {}) or {}).get("sourceIp", "")
    ua = str(body.get("ua", ""))[:300]
    sid = str(body.get("sid", ""))[:64]
    event_type = str(body.get("type", "pageview"))[:20]
    bot = looks_automated(ua)
    country = country_of(ip)
    referrer = str(body.get("referrer", ""))[:500]

    item = {
        "date": date_str,
        "ts_session": f"{ts}#{sid}",
        "timestamp": ts,
        "session_id": sid,
        "event_type": event_type,
        "site": site,
        "bot": bot,
        "page": str(body.get("page", ""))[:200],
        "path": str(body.get("path", ""))[:300],
        "referrer": referrer,
        "country": country,
        "ip": ip,
        "user_agent": ua,
        "screen": str(body.get("screen", ""))[:20],
        # The hostname the page was actually served under, as the browser saw
        # it. `site` is this mapped through SITES and defaults when unknown;
        # `host` is the raw truth, so a host nobody has mapped yet shows up
        # as itself instead of disappearing into the default.
        "host": str(body.get("host", ""))[:120],
        "click_target": str(body.get("target", ""))[:100],
        "uni_key": str(body.get("uni", ""))[:50],
        "message": str(body.get("message", ""))[:200],
        "ttl": int(time.time()) + RETENTION_DAYS * 86400,
    }
    item = {k: v for k, v in item.items() if v not in ("", None)}

    table = dynamodb.Table(TABLE_NAME)
    table.put_item(Item=item)
    _rollup(table, date_str, site, bot, event_type, item, sid)
    return response(200, {"ok": True})


def _path_expr(dotted, i, names):
    """Render one dotted path as an expression reference, naming every segment.

    Every segment goes through ExpressionAttributeNames: counter keys are
    derived from page labels, referrer hosts and error messages, any of which
    can collide with a DynamoDB reserved word or start with a digit.
    """
    ref = []
    for j, p in enumerate(dotted.split(".")):
        names[f"#n{i}_{j}"] = p
        ref.append(f"#n{i}_{j}")
    return ".".join(ref)


def _bump_once(table, date_str, key, paths):
    names, values, sets = {}, {":one": 1, ":zero": 0}, []
    for i, dotted in enumerate(paths):
        joined = _path_expr(dotted, i, names)
        sets.append(f"{joined} = if_not_exists({joined}, :zero) + :one")
    table.update_item(
        Key={"date": date_str, "ts_session": key},
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values)


def _ensure_parents(table, date_str, key, paths):
    """Create the intermediate maps the counter paths live in.

    DynamoDB will not create an intermediate map inside an UpdateExpression:
    setting human.referrers.__direct when human.referrers does not yet exist
    is a ValidationException, and because one expression sets every counter
    for the event, that single bad path loses ALL of them. This is not a
    corner case -- it is every event of every new day, and it is every
    counter group added after a row was first written.

    So the parents are created depth by depth (human, then human.referrers),
    each with if_not_exists so a concurrent writer cannot clear a live
    counter. Only the failure path pays for this; the steady state stays at
    one write per event.
    """
    by_depth = {}
    for dotted in paths:
        parts = dotted.split(".")
        for depth in range(1, len(parts)):          # every prefix but the leaf
            by_depth.setdefault(depth, set()).add(".".join(parts[:depth]))
    for depth in sorted(by_depth):                  # shallow first: a child
        names, values, sets = {}, {}, []            # cannot precede its parent
        for i, prefix in enumerate(sorted(by_depth[depth])):
            joined = _path_expr(prefix, i, names)
            values[f":m{i}"] = {}
            sets.append(f"{joined} = if_not_exists({joined}, :m{i})")
        table.update_item(
            Key={"date": date_str, "ts_session": key},
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values)


def _bump(table, date_str, key, paths):
    """Add 1 to each dotted counter path on one rollup row."""
    try:
        _bump_once(table, date_str, key, paths)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "ValidationException":
            raise
        _ensure_parents(table, date_str, key, paths)
        _bump_once(table, date_str, key, paths)


def rollup_paths(who, event_type, item):
    """The counter paths one event contributes.

    Pure and exported, because there are two callers: this collector, on every
    event, and scripts/backfill_analytics_rollups.py, which recomputes a day
    from its raw events. They were two separate implementations of this list
    and had already drifted -- the backfill counted pages under their raw
    data-page value, so /stem.html#njit and stem were different pages in a
    backfilled row and the same page in a live one, and it knew nothing of
    devices, entry pages, read-on or errors. One list, one meaning.
    """
    paths = [f"{who}.events", f"{who}.{event_type}"]
    label = page_label(item.get("page", ""), item.get("path", ""))
    if event_type == "pageview":
        paths.append(f"{who}.hours.{item['timestamp'][11:13]}")
        paths.append(f"{who}.pages.{_safe(label)}")
        paths.append(f"{who}.devices.{device_of(item.get('screen', ''))}")
        if item.get("country"):
            paths.append(f"{who}.countries.{_safe(item['country'])}")
        # Three cases, and conflating them loses the one that matters: another
        # site sent them, nothing did (typed, bookmarked, or a stripped
        # referrer), or they clicked through from one of our own pages -- which
        # is navigation, not a source, and is counted nowhere.
        ref = host_of(item.get("referrer", ""))
        if ref and ref not in SITES:
            paths.append(f"{who}.referrers.{_safe(ref)}")
        elif not ref:
            paths.append(f"{who}.referrers.__direct")
    elif event_type == "click":
        if item.get("click_target"):
            paths.append(f"{who}.clicks_by_target.{_safe(item['click_target'])}")
        if item.get("uni_key"):
            paths.append(f"{who}.universities.{_safe(item['uni_key'])}")
    elif event_type in ("error", "rejection"):
        msg = item.get("message") or "unknown"
        paths.append(f"{who}.errors_by_message.{_safe(msg)}")
        paths.append(f"{who}.errors_by_page.{_safe(label)}")
    return paths


def entry_path(who, item):
    """The counter for the page a session came in on."""
    return f"{who}.entry_pages.{_safe(page_label(item.get('page', ''), item.get('path', '')))}"


def _rollup(table, date_str, site, bot, event_type, item, sid):
    """Daily counters, so the dashboard never reads raw events to total them.

    Written as a second update per event rather than computed at read time:
    reading a spike's worth of raw events cannot be done inside the Lambda's
    timeout, and a total that quietly truncates is worse than no total.
    """
    who = "bot" if bot else "human"
    key = f"{ROLLUP}#{site}"
    paths = rollup_paths(who, event_type, item)
    try:
        _bump(table, date_str, key, paths)
    except Exception as exc:                       # noqa: BLE001
        # A lost counter must not 500 -- but it must not be silent either.
        # This except swallowed a ValidationException on every single event
        # for as long as the rollups existed, and because the collector
        # answers 200 regardless, nothing anywhere said so. The dashboard
        # read zeroes and looked merely quiet.
        print(f"[ERROR] rollup bump failed for {key}: "
              f"{type(exc).__name__}: {exc}; paths={paths}")

    # Distinct sessions, counted exactly: the first event of a session creates
    # a marker, and only a successful create bumps the counter.
    if sid:
        marker = {"date": date_str, "ts_session": f"{SESSION}#{site}#{sid}",
                  "ttl": int(time.time()) + RETENTION_DAYS * 86400}
        # Only the conditional create decides new-versus-seen. The wider
        # `except Exception` this replaces also caught a failure of the _bump
        # that follows a SUCCESSFUL create, and then ran the already-seen
        # branch -- so a brand-new session was counted as one that read on.
        fresh = True
        try:
            table.put_item(Item=marker,
                           ConditionExpression="attribute_not_exists(ts_session)")
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") \
                    != "ConditionalCheckFailedException":
                print(f"[ERROR] session marker put failed: {exc}")
                return
            fresh = False
        except Exception as exc:                   # noqa: BLE001
            print(f"[ERROR] session marker put failed: {type(exc).__name__}: {exc}")
            return

        if fresh:
            # First event of this session: count it, and record where it came in.
            first = [f"{who}.sessions"]
            if event_type == "pageview":
                first.append(entry_path(who, item))
            try:
                _bump(table, date_str, key, first)
            except Exception as exc:               # noqa: BLE001
                print(f"[ERROR] session bump failed: {type(exc).__name__}: {exc}")
        elif event_type == "pageview":
            # Already seen. On its second pageview the session counts as one
            # that read on rather than bounced -- the cheapest engagement
            # measure that needs no read of the session's whole history.
            try:
                got = table.update_item(
                    Key={"date": date_str, "ts_session": marker["ts_session"]},
                    UpdateExpression="SET #v = if_not_exists(#v, :zero) + :one",
                    ExpressionAttributeNames={"#v": "views"},
                    ExpressionAttributeValues={":one": 1, ":zero": 0},
                    ReturnValues="UPDATED_NEW")
                if int((got.get("Attributes") or {}).get("views", 0)) == 1:
                    _bump(table, date_str, key, [f"{who}.read_on_sessions"])
            except Exception as exc:               # noqa: BLE001
                print(f"[ERROR] read-on bump failed: {type(exc).__name__}: {exc}")


def page_label(page: str, path: str) -> str:
    """One label per page, whatever the page called itself.

    data-page is a label on most pages ("index", "briefing") and a path on the
    generated ones ("/stem.html#njit"), so the same page arrived under several
    names and split its own counter. Labels win; a path is reduced to one.

    THE LITERAL "unknown" IS NOT A LABEL. The beacon sends `data-page` or the
    string "unknown", and "unknown" is truthy, so `page or path` took it and
    never looked at the path beside it. 32 of 59 pages carry no data-page, so
    on 2026-10-09 -- the day the site was shared into a government Teams
    channel -- 62 of 208 human pageviews were filed as a page called
    "unknown", including every view of /about, /overview, /china and /india.
    Every one of those rows carried a perfectly good path. The bucket was
    second only to the homepage, and it was an artefact.
    """
    if (page or "").strip().lower() == "unknown":
        page = ""
    v = (page or path or "").strip()
    v = v.split("#")[0].split("?")[0].lstrip("/")
    if v.endswith(".html"):
        v = v[:-5]
    return v or "index"


def device_of(screen: str) -> str:
    """Phone, tablet or desktop, from the screen width the beacon reports.

    A spike arriving from social is mostly phones, and the site has to hold at
    400px; without this there is no way to see that from the numbers.
    """
    try:
        width = int(str(screen).split("x")[0])
    except (ValueError, AttributeError):
        return "unknown"
    if width <= 480:
        return "phone"
    return "tablet" if width <= 1024 else "desktop"


def _safe(s: str) -> str:
    """A map key DynamoDB will accept: dots and brackets would nest it."""
    return "".join(c if c.isalnum() or c in "-_/#" else "_" for c in str(s))[:120]


# ---------------------------------------------------------------------------
# dashboard
# ---------------------------------------------------------------------------
def handle_analytics(event):
    params = event.get("queryStringParameters") or {}
    if params.get("password", "") != ANALYTICS_PASSWORD:
        return response(401, {"error": "unauthorized"})
    try:
        days = min(max(int(params.get("days", 30)), 1), RETENTION_DAYS)
    except ValueError:
        days = 30
    site = params.get("site") or DEFAULT_SITE
    include_bots = (params.get("bots") or "exclude") == "include"
    groups = ["human", "bot"] if include_bots else ["human"]

    table = dynamodb.Table(TABLE_NAME)
    today = datetime.now(timezone.utc).date()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(days)]

    daily, hourly = {}, {}
    buckets = {k: {} for k in ("pages", "entry_pages", "countries", "referrers",
                               "universities", "clicks_by_target", "devices",
                               "errors_by_message", "errors_by_page")}
    totals = {"events": 0, "pageview": 0, "click": 0, "error": 0, "rejection": 0,
              "sessions": 0, "read_on_sessions": 0}
    for d in dates:
        row = table.get_item(Key={"date": d, "ts_session": f"{ROLLUP}#{site}"}
                             ).get("Item") or {}
        views = 0
        for g in groups:
            block = row.get(g) or {}
            for k in totals:
                totals[k] += int(block.get(k, 0) or 0)
            views += int(block.get("pageview", 0) or 0)
            _merge(hourly, block.get("hours"))
            for name, into in buckets.items():
                _merge(into, block.get(name))
        daily[d] = views

    sessions_seen = totals["sessions"]
    avg = round(totals["click"] / sessions_seen, 1) if sessions_seen else 0
    per_session = round(totals["pageview"] / sessions_seen, 2) if sessions_seen else 0
    read_on = (round(totals["read_on_sessions"] / sessions_seen * 100, 1)
               if sessions_seen else 0)
    return response(200, {
        "period_days": days,
        "site": site,
        "sites": sorted(set(SITES.values())),
        "bots": "included" if include_bots else "excluded",
        "total_views": totals["pageview"],
        "total_sessions": sessions_seen,
        "total_clicks": totals["click"],
        "total_errors": totals["error"] + totals["rejection"],
        "avg_clicks_per_session": avg,
        "views_per_session": per_session,
        "read_on_pct": read_on,
        "daily_views": dict(sorted(daily.items())),
        "hourly_views": {str(int(h)): c for h, c in sorted(hourly.items())},
        "top_countries": _top(buckets["countries"]),
        "top_referrers": _top(buckets["referrers"]),
        "top_pages": _top(buckets["pages"]),
        "top_entry_pages": _top(buckets["entry_pages"]),
        "top_universities": _top(buckets["universities"]),
        "top_clicks": _top(buckets["clicks_by_target"]),
        "devices": _top(buckets["devices"], 6),
        "top_errors": _top(buckets["errors_by_message"], 10),
        "errors_by_page": _top(buckets["errors_by_page"], 10),
        "recent_sessions": _recent(table, site, include_bots),
        "chat_spend": _chat_spend(dates) if site == CHAT_SITE else None,
        "country_basis": "the country each IP block was allocated to, from the "
                         "regional registries; a VPN or cloud region reads as "
                         "its allocation country",
    })


def _chat_spend(dates: list) -> dict:
    """What the assistant spent at the model provider, per day, against its ceiling.

    Never raises. The rollups above are the dashboard's point; a spend read
    that fails -- a permission not yet granted, the table renamed -- returns an
    error note in this one field rather than a 500 for the whole page. That is
    exactly how this reader went dark once already, over a missing GetItem.
    """
    try:
        ledger = dynamodb.Table(CHAT_SPEND_TABLE)
        daily, budget, tracked = {}, None, []
        tot = {"spent": 0, "calls": 0, "refused": 0, "prompt": 0, "cached": 0,
               "completion": 0, "unmeasured": 0}
        for d in sorted(dates):
            row = ledger.get_item(Key={"pk": f"SPEND:{d}"}).get("Item") or {}
            if row:
                tracked.append(d)
            spent = int(row.get("spent_micro", 0) or 0)
            calls = int(row.get("calls", 0) or 0)
            refused = int(row.get("refused", 0) or 0)
            day_budget = int(row.get("budget_micro", 0) or 0) or None
            if day_budget:
                budget = day_budget          # latest day wins: the ceiling in force
            tot["spent"] += spent
            tot["calls"] += calls
            tot["refused"] += refused
            tot["prompt"] += int(row.get("prompt_tokens", 0) or 0)
            tot["cached"] += int(row.get("cached_tokens", 0) or 0)
            tot["completion"] += int(row.get("completion_tokens", 0) or 0)
            tot["unmeasured"] += int(row.get("unmeasured_calls", 0) or 0)
            daily[d] = {"spent_usd": round(spent / MICRO, 4), "calls": calls,
                        "refused": refused,
                        "budget_usd": round(day_budget / MICRO, 2) if day_budget else None,
                        # Capped means someone was actually turned away, not
                        # merely that spend came close to the line.
                        "capped": refused > 0}
        today = daily.get(max(dates)) if dates else None
        return {
            "budget_usd": round(budget / MICRO, 2) if budget else None,
            "today": today,
            "period_spent_usd": round(tot["spent"] / MICRO, 4),
            "period_calls": tot["calls"],
            "period_refused": tot["refused"],
            "days_capped": sum(1 for v in daily.values() if v["capped"]),
            # The ledger began on 2026-09-14. A day before that is "not
            # measured", not "$0", so averages divide by the days it covers.
            "tracked_days": len(tracked),
            "tracked_since": min(tracked) if tracked else None,
            "avg_per_tracked_day_usd": (round(tot["spent"] / len(tracked) / MICRO, 4)
                                        if tracked else None),
            "avg_cost_per_call_usd": (round(tot["spent"] / tot["calls"] / MICRO, 4)
                                      if tot["calls"] else None),
            "prompt_tokens": tot["prompt"],
            "cached_prompt_pct": (round(100 * tot["cached"] / tot["prompt"], 1)
                                  if tot["prompt"] else None),
            "completion_tokens": tot["completion"],
            "unmeasured_calls": tot["unmeasured"],
            "daily": daily,
        }
    except Exception as exc:                                   # noqa: BLE001
        print(f"[ERROR] chat spend read failed: {type(exc).__name__}: {exc}")
        return {"error": f"{type(exc).__name__}: could not read the chat spend ledger"}


def _merge(into: dict, block):
    for k, v in (block or {}).items():
        into[k] = into.get(k, 0) + int(v or 0)


def _top(counts: dict, n: int = 20) -> dict:
    return dict(sorted(counts.items(), key=lambda kv: -kv[1])[:n])


def _recent(table, site, include_bots, limit: int = 50) -> list:
    """The most recent sessions, from today's and yesterday's raw events.

    Paginated and capped: this is the one read that touches raw events, and it
    must stay bounded no matter how busy the day was.
    """
    today = datetime.now(timezone.utc).date()
    sessions, scanned = {}, 0
    for i in (0, 1):
        d = (today - timedelta(days=i)).isoformat()
        kw = {"KeyConditionExpression": Key("date").eq(d) & Key("ts_session").lt("@"),
              "ScanIndexForward": False}
        while scanned < MAX_RECENT_EVENTS:
            r = table.query(**kw)
            for it in r.get("Items", []):
                scanned += 1
                if it.get("site", DEFAULT_SITE) != site:
                    continue
                if bool(it.get("bot")) and not include_bots:
                    continue
                sid = it.get("session_id") or "?"
                s = sessions.setdefault(sid, {"session_id": sid[:8], "views": 0,
                                              "clicks": 0, "country": "",
                                              "timestamp": it.get("timestamp", ""),
                                              "pages": []})
                if it.get("event_type") == "click":
                    s["clicks"] += 1
                else:
                    s["views"] += 1
                if it.get("country") and not s["country"]:
                    s["country"] = it["country"]
                p = it.get("path") or it.get("page")
                if p and p not in s["pages"] and len(s["pages"]) < 12:
                    s["pages"].append(p)
                if it.get("timestamp", "") < s["timestamp"]:
                    s["timestamp"] = it["timestamp"]
            if "LastEvaluatedKey" not in r or len(sessions) >= limit * 3:
                break
            kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]
        if len(sessions) >= limit:
            break
    return sorted(sessions.values(), key=lambda s: s["timestamp"], reverse=True)[:limit]
