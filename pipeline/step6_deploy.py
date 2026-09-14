"""
Step 6: DEPLOY — Build a versioned copy of site/ in S3 and switch to it.

Every deploy writes a complete build to its own prefix, v/{YYYYmmddTHHMMSSZ}/,
and goes live by moving the CloudFront origin path there in a single API call.
Readers see the previous build until that call succeeds, so an interrupted or
failed deploy changes nothing they can reach, and a rollback is one call back
to the prefix before it.

Because each build lives at a fresh prefix, it has to be COMPLETE -- a file
missing from it is a 404, not a stale copy that quietly still works. So the
upload is planned by walking site/ rather than from a list of extensions, and
reconciled against S3 before the origin moves.

Uploading all ~750 objects every time took the better part of an hour, most of
it spent spawning one `aws s3 cp` process per file. Instead the new prefix is
seeded by a server-side copy of the build that is currently live -- no bytes
leave this machine -- and only files whose content or headers actually changed
are re-uploaded, in parallel, through one boto3 client. What changed is decided
by comparing fingerprints against a manifest written for each published build.

Input:  site/ directory (HTML + JSON + assets)
Output: a new v/ prefix, the CloudFront origin pointed at it, cache invalidated
"""
from __future__ import annotations
import concurrent.futures
import errno
import fcntl
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import NamedTuple

from .state import PipelineState, StepOutcome


S3_BUCKET = os.environ.get("S3_BUCKET", "phd-demographics-andy-barr")
S3_URI = f"s3://{S3_BUCKET}/"

# Deploys are ATOMIC: every build is uploaded to its own prefix under v/, and
# the site is switched by moving the CloudFront origin path in a single API
# call. Nothing a reader can reach changes until that call succeeds.
#
# The old scheme wrote file-by-file straight into the bucket root over about
# fifteen minutes. A deploy killed in the middle of that left the live site
# genuinely mixed -- some pages from the new build, some from the old, with no
# way to tell and no check that would notice, because verify_deploy samples
# ten files. One was killed today and did no damage purely because it died
# before the first upload rather than during it.
#
# Rolling back is setting OriginPath to the previous build, which stays in S3.
BUILD_PREFIX = "v"
_UPLOAD_WORKERS = 16           # parallel uploads; was one CLI process per file
_MANIFEST_PREFIX = "manifests"  # key -> fingerprint per build, outside v/
_MANIFEST_VERSION = 1           # bump to force a full re-upload

# CloudFront gzips responses on the fly, but only below this size. JSON is
# published precisely so people can script against it, and above the ceiling
# CloudFront will not compress at all -- so those objects must be
# pre-compressed or they ship raw, 19.7 MB in the case of _search.json, which
# is fetched only by code that already handles gzip.
CLOUDFRONT_COMPRESS_MAX = 9 * 1024 * 1024
KEEP_BUILDS = 4                # older prefixes are pruned after a good deploy
CLOUDFRONT_DISTRIBUTION = os.environ.get("CLOUDFRONT_DISTRIBUTION", "E3IYHYCEQPE00Q")
AWS_PROFILE = os.environ.get("AWS_PROFILE", "personal")

# Cache-Control by file type
CACHE_RULES = {
    ".html": "public, max-age=300, stale-while-revalidate=86400",  # 5 min + stale ok for 24h
    ".json": "public, max-age=3600",  # 1 hour
    ".js": "public, max-age=300, stale-while-revalidate=86400",  # 5 min + stale ok for 24h
    ".css": "public, max-age=300, stale-while-revalidate=86400",  # same as .js
    ".ico": "public, max-age=604800",
    ".png": "public, max-age=604800",
    ".jpeg": "public, max-age=604800",
    ".svg": "public, max-age=604800",
    ".xml": "public, max-age=3600",
    ".txt": "public, max-age=3600",
    ".pdf": "public, max-age=3600",   # rebuilt whenever the briefing is
    ".parquet": "public, max-age=3600",
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".js": "application/javascript",
    ".css": "text/css; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpeg": "image/jpeg",
    # These four were typed by hand in the old per-step uploads, or fell
    # through the sweep's octet-stream default. sitemap.xml was declared
    # application/xml by its own upload step; robots.txt, llms.txt and the
    # one SVG were served as octet-stream, which browsers and crawlers both
    # dislike. The planner has a single default, so they are named here.
    ".xml": "application/xml",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".parquet": "application/octet-stream",
    # Without this the briefing PDFs go out as octet-stream, which makes the
    # browser download the file instead of opening it.
    ".pdf": "application/pdf",
}


def _gzip_to_temp(src: Path) -> Path:
    """Gzip a file into the system temp dir, return the compressed path.

    Deliberately NOT next to the source. This used to write site/foo.html.gz
    beside the original and unlink it afterwards, which is fine until a deploy
    is killed mid-run -- and one was. The stray .gz then sits in site/, and
    since the planner below walks the whole tree rather than an extension
    allowlist, the next deploy would faithfully ship it as its own object.
    """
    fd, tmp = tempfile.mkstemp(suffix=".gz", prefix="deploy-")
    os.close(fd)
    gz_path = Path(tmp)
    with open(src, "rb") as f_in, gzip.open(str(gz_path), "wb", compresslevel=9) as f_out:
        while chunk := f_in.read(1 << 20):
            f_out.write(chunk)
    return gz_path


class _Obj(NamedTuple):
    """One file's place in a build: where it comes from, how it is served."""
    src: Path
    key: str
    ctype: str
    cache: str
    gz: bool


def _should_gzip(f: Path, ext: str, rel: str) -> bool:
    """Whether to pre-compress, matching what CloudFront will not do for us."""
    if ext == ".html":
        # The per-university pages are ~1 MB each and there are 200-odd; the
        # handful of top-level pages are small enough to leave to CloudFront.
        return rel.startswith("universities/")
    if ext == ".json":
        # CloudFront compresses on the fly below its ceiling. Above it, it
        # does not compress at all, so those must ship pre-compressed or go
        # out raw -- 19.7 MB in the case of _search.json.
        return f.stat().st_size > CLOUDFRONT_COMPRESS_MAX
    return False


def _plan_objects(site_dir: Path) -> list[_Obj]:
    """Every file under site/ that belongs in a build, with its headers.

    One walk replaces eight typed upload steps and the sweep that existed to
    catch what they forgot. Those steps were an allowlist of extensions and
    directories, and it was not kept: og/ was missed, then .css, then ten
    root files. Walking the tree cannot forget a file, which is the property
    that matters here -- a build is served from its own prefix, so anything
    absent from it is a 404 rather than a stale file that quietly still works.
    """
    objs: list[_Obj] = []
    for f in sorted(site_dir.rglob("*")):
        if not f.is_file() or f.name.startswith("."):
            continue
        rel = f.relative_to(site_dir).as_posix()
        # A compressed copy sitting beside its source is debris from a deploy
        # that was killed mid-gzip, back when the .gz was written next to the
        # original. It is not part of the site, and shipping it would put a
        # bare .gz at a public URL.
        if f.suffix == ".gz" and f.with_suffix("").exists():
            print(f"  ignoring stray {rel} (leftover from an interrupted deploy)")
            continue
        ext = f.suffix.lower()
        objs.append(_Obj(
            src=f,
            key=rel,
            ctype=CONTENT_TYPES.get(ext, "application/octet-stream"),
            cache=CACHE_RULES.get(ext, "public, max-age=3600"),
            gz=_should_gzip(f, ext, rel),
        ))
    return objs


def _fingerprint(o: _Obj) -> str:
    """Content hash plus the headers, so a cache-rule change re-uploads too."""
    h = hashlib.sha256()
    h.update(f"{_MANIFEST_VERSION}\0{o.ctype}\0{o.cache}\0{int(o.gz)}\0".encode())
    with open(o.src, "rb") as fh:
        while chunk := fh.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def _s3():
    """One boto3 client, shared across upload threads (botocore allows this).

    The point of using boto3 at all is that the old path spawned a whole
    `aws s3 cp` process per object -- ~750 of them, each paying interpreter
    startup and a fresh TLS handshake before a byte moved. That alone was
    most of an hour.
    """
    import boto3
    return boto3.Session(profile_name=AWS_PROFILE).client("s3")


def _live_build_id() -> str | None:
    """The build CloudFront is serving right now, or None if it is not on one.

    Seeding from the LIVE build rather than the newest prefix in S3 matters:
    the newest prefix may be a deploy that was interrupted or refused, and
    seeding from a half-uploaded build would carry its gaps forward.
    """
    cfg = _aws("cloudfront", "get-distribution-config",
               "--id", CLOUDFRONT_DISTRIBUTION)
    if cfg.returncode != 0:
        return None
    try:
        items = json.loads(cfg.stdout)["DistributionConfig"]["Origins"]["Items"]
    except (ValueError, KeyError):
        return None
    m = re.match(rf"^/{BUILD_PREFIX}/(\d{{8}}T\d{{6}}Z)$",
                 items[0].get("OriginPath", "") or "")
    return m.group(1) if m else None


def _load_manifest(client, build_id: str) -> dict[str, str]:
    """The key -> fingerprint map written after that build was published."""
    try:
        body = client.get_object(
            Bucket=S3_BUCKET,
            Key=f"{_MANIFEST_PREFIX}/{build_id}.json")["Body"].read()
        doc = json.loads(body)
    except Exception:
        return {}
    if doc.get("version") != _MANIFEST_VERSION:
        return {}
    return doc.get("objects") or {}


def _write_manifest(client, build_id: str, fps: dict[str, str]) -> None:
    """Record what this build contains, for the next deploy to diff against.

    Written only after a successful publish. A manifest for a build that
    never went live would describe a prefix the next deploy has no reason to
    seed from, and could be pruned out from under it.

    Kept OUTSIDE the v/ prefix on purpose: the CloudFront origin path points
    into v/{build}, so nothing here is reachable from the site.
    """
    client.put_object(
        Bucket=S3_BUCKET,
        Key=f"{_MANIFEST_PREFIX}/{build_id}.json",
        Body=json.dumps({"version": _MANIFEST_VERSION,
                         "build_id": build_id,
                         "objects": fps}).encode(),
        ContentType="application/json",
    )


def _seed_from(prev: str, build_id: str) -> tuple[bool, str]:
    """Server-side copy the previous build into this one.

    Nothing leaves this machine: S3 copies object-to-object internally, and
    MetadataDirective=COPY carries Content-Type, Content-Encoding and
    Cache-Control across unchanged. What follows only has to overwrite the
    files that actually differ.
    """
    r = _aws("s3", "cp",
             f"{S3_URI}{BUILD_PREFIX}/{prev}/",
             f"{S3_URI}{BUILD_PREFIX}/{build_id}/",
             "--recursive", "--metadata-directive", "COPY",
             "--only-show-errors")
    if r.returncode != 0:
        return False, (r.stderr or "copy failed").strip()[:200]
    return True, ""


def _list_keys(client, prefix: str) -> set[str]:
    """Every key under a prefix, relative to it. Paginated -- there are 750+."""
    found: set[str] = set()
    token = None
    while True:
        kw = {"Bucket": S3_BUCKET, "Prefix": prefix, "MaxKeys": 1000}
        if token:
            kw["ContinuationToken"] = token
        page = client.list_objects_v2(**kw)
        for item in page.get("Contents", []):
            found.add(item["Key"][len(prefix):])
        if not page.get("IsTruncated"):
            return found
        token = page.get("NextContinuationToken")


def _put(client, o: _Obj, prefix: str) -> str | None:
    """Upload one object. Returns an error string, or None on success."""
    extra = {"ContentType": o.ctype, "CacheControl": o.cache}
    tmp = None
    try:
        body = o.src
        if o.gz:
            tmp = _gzip_to_temp(o.src)
            body = tmp
            extra["ContentEncoding"] = "gzip"
        client.upload_file(str(body), S3_BUCKET, f"{prefix}{o.key}",
                           ExtraArgs=extra)
        return None
    except Exception as e:
        return f"{o.key}: {str(e)[:120]}"
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


def _put_many(client, objs: list[_Obj], prefix: str) -> list[str]:
    """Upload in parallel. One connection pool, _UPLOAD_WORKERS threads."""
    if not objs:
        return []
    errs: list[str] = []
    done = 0
    with concurrent.futures.ThreadPoolExecutor(_UPLOAD_WORKERS) as pool:
        futures = {pool.submit(_put, client, o, prefix): o for o in objs}
        for fut in concurrent.futures.as_completed(futures):
            err = fut.result()
            if err:
                errs.append(err)
            done += 1
            if done % 50 == 0 or done == len(objs):
                print(f"    {done}/{len(objs)} uploaded", flush=True)
    return errs


class _DeployLock:
    """Refuse to run a second deploy while one is already in flight.

    Nothing previously stopped two `pipeline run --step deploy` invocations
    from overlapping. Both would `aws s3 sync` into the same bucket and both
    would invalidate CloudFront, so a half-written file could be served, or a
    stale file could survive the invalidation that was meant to clear it. This
    happened as a near miss: one deploy was launched, silently no-opped on a
    bad subcommand, and a second was started on top of it.

    flock is released by the kernel when the process dies, so a killed deploy
    does not strand the lock the way a lockfile-plus-PID scheme would.
    """

    def __init__(self, path: Path):
        self.path = path
        self.fh = None

    def acquire(self):
        # O_RDWR|O_CREAT, never "w": opening with "w" truncates the file
        # BEFORE flock is attempted, so a refused deploy would erase the
        # holder's pid and destroy the only diagnostic the lock carries.
        # Truncate only after the lock is actually ours.
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o644)
        self.fh = os.fdopen(fd, "r+")
        try:
            fcntl.flock(self.fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            if exc.errno not in (errno.EAGAIN, errno.EACCES):
                raise
            try:
                holder = self.fh.read().strip() or "an unknown pid"
            except OSError:
                holder = "an unknown pid"
            self.fh.close()
            self.fh = None
            raise RuntimeError(
                f"another deploy (pid {holder}) holds {self.path.name}. Wait for "
                f"it to finish rather than running two syncs into the same bucket."
            ) from exc
        self.fh.seek(0)
        self.fh.truncate()
        self.fh.write(str(os.getpid()))
        self.fh.flush()
        return self

    def release(self):
        if self.fh:
            fcntl.flock(self.fh.fileno(), fcntl.LOCK_UN)
            self.fh.close()
            self.fh = None


# CloudFront compresses on the fly for objects between 1 KB and 10 MB and
# negotiates Content-Encoding correctly against the request. Pre-compressing
# below that ceiling is not just redundant, it is wrong: a pre-compressed S3
# object asserts `content-encoding: gzip` even when the client sent
# `Accept-Encoding: identity`, so naive consumers get binary --
#
#     json.load(urllib.request.urlopen('.../data/stem/msu.json'))
#     -> UnicodeDecodeError: 'utf-8' codec can't decode byte 0x8b
#
# Browsers and `requests` cope; `urllib` and bare `curl` do not, and the bulk
# JSON is published precisely so people can script against it. Above the
# ceiling CloudFront will not compress at all, so those objects must still be
# pre-compressed or they ship raw -- 19.7 MB in the case of _search.json,
# which is fetched only by code that already handles gzip.
CLOUDFRONT_COMPRESS_MAX = 9 * 1024 * 1024


def _upload_json(src: Path, key: str, s3_uri: str) -> tuple[bool, str]:
    """Upload one JSON, pre-compressing only if CloudFront cannot."""
    cache = CACHE_RULES.get(".json", "public, max-age=3600")
    base = ["aws", "s3", "cp", "--profile", AWS_PROFILE,
            "--cache-control", cache, "--content-type", "application/json"]
    if src.stat().st_size > CLOUDFRONT_COMPRESS_MAX:
        gz_path = _gzip_file(src)
        try:
            cmd = base[:3] + [str(gz_path), f"{s3_uri}{key}"] + base[3:] + \
                  ["--content-encoding", "gzip"]
            result = subprocess.run(cmd, capture_output=True, text=True)
        finally:
            gz_path.unlink(missing_ok=True)
    else:
        cmd = base[:3] + [str(src), f"{s3_uri}{key}"] + base[3:]
        result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0, (result.stderr or "").strip()[:120]


def _aws(*args: str, **kw) -> subprocess.CompletedProcess:
    return subprocess.run(["aws", *args, "--profile", AWS_PROFILE],
                          capture_output=True, text=True, **kw)


def _count_objects(prefix: str) -> int:
    r = _aws("s3", "ls", f"{S3_URI}{prefix}", "--recursive")
    return len([l for l in r.stdout.splitlines() if l.strip()]) if r.returncode == 0 else -1


_BUILD_ID_RE = re.compile(r"^\d{8}T\d{6}Z$")


def _publish_build(build_id: str, expected: int) -> tuple[bool, str]:
    """Point CloudFront at this build. One call, all or nothing.

    Verifies the upload landed before switching. A short prefix means the
    upload was interrupted, and switching to it would publish a half site --
    which is the exact failure this whole scheme exists to prevent, so it
    refuses rather than guesses.
    """
    # Refuse anything that is not a real build id. A unit test called this
    # with build_id="b" and mocked only the object count, so the AWS calls ran
    # for real and repointed the production origin at /v/b -- every page on
    # the live site returned AccessDenied until it was put back by hand. A
    # test should not be able to reach production, and neither should a typo.
    if not _BUILD_ID_RE.match(build_id or ""):
        return False, (f"{build_id!r} is not a build id "
                       "(expected YYYYmmddTHHMMSSZ); refusing to move the origin")

    prefix = f"{BUILD_PREFIX}/{build_id}/"
    found = _count_objects(prefix)
    if found < 0:
        return False, "could not list the uploaded build"
    # The uploaded count is what the steps above reported; allow the sitemap
    # and any file S3 lists differently, but not a materially short upload.
    if found < expected * 0.98:
        return False, (f"only {found} objects under {prefix}, expected about "
                       f"{expected}; refusing to publish a partial build")

    cfg = _aws("cloudfront", "get-distribution-config",
               "--id", CLOUDFRONT_DISTRIBUTION)
    if cfg.returncode != 0:
        return False, "could not read the distribution config"
    doc = json.loads(cfg.stdout)
    etag, dist = doc["ETag"], doc["DistributionConfig"]
    previous = dist["Origins"]["Items"][0].get("OriginPath", "")
    want = f"/{BUILD_PREFIX}/{build_id}"
    if previous == want:
        return True, "already current"
    for origin in dist["Origins"]["Items"]:
        origin["OriginPath"] = want

    tmp = Path(tempfile.gettempdir()) / f"cfcfg-{build_id}.json"
    tmp.write_text(json.dumps(dist))
    try:
        up = _aws("cloudfront", "update-distribution",
                  "--id", CLOUDFRONT_DISTRIBUTION,
                  "--if-match", etag,
                  "--distribution-config", f"file://{tmp}")
    finally:
        tmp.unlink(missing_ok=True)
    if up.returncode != 0:
        return False, (up.stderr or "update-distribution failed").strip()[:200]
    print(f"  published: origin {previous or '/'} -> {want}")
    print(f"  rollback:  aws cloudfront update-distribution --id "
          f"{CLOUDFRONT_DISTRIBUTION} with OriginPath {previous or '/'}")
    return True, ""


def _prune_old_builds(current: str) -> None:
    """Delete all but the newest KEEP_BUILDS prefixes.

    Runs only after a successful publish, and never touches the live one --
    a rollback target has to still exist.
    """
    r = _aws("s3", "ls", f"{S3_URI}{BUILD_PREFIX}/")
    if r.returncode != 0:
        return
    builds = sorted(l.split()[-1].rstrip("/") for l in r.stdout.splitlines()
                    if l.strip().startswith("PRE"))
    stale = [b for b in builds[:-KEEP_BUILDS] if b != current]
    for b in stale:
        _aws("s3", "rm", f"{S3_URI}{BUILD_PREFIX}/{b}/", "--recursive",
             "--only-show-errors")
        # Its manifest describes a prefix that no longer exists.
        _aws("s3", "rm", f"{S3_URI}{_MANIFEST_PREFIX}/{b}.json",
             "--only-show-errors")
    if stale:
        print(f"  pruned {len(stale)} old build(s), kept {KEEP_BUILDS}")


def step6_deploy(state: PipelineState) -> PipelineState:
    """Deploy site to S3 with pre-compression and cache headers."""
    if state.should_halt():
        return state

    base_dir = state.config.base_dir
    site_dir = base_dir / "site"

    lock = _DeployLock(base_dir / ".deploy.lock")
    try:
        lock.acquire()
    except RuntimeError as exc:
        print(f"\n[Step 6: DEPLOY] refused: {exc}")
        return state.with_outcome(StepOutcome(
            step_name="deploy", university_key="", success=False,
            message=str(exc), data={}, errors=(str(exc),), warnings=(),
            timestamp=datetime.utcnow().isoformat(),
        ))

    try:
        return _deploy_locked(state, base_dir, site_dir)
    finally:
        lock.release()


def _deploy_locked(state: PipelineState, base_dir: Path,
                   site_dir: Path) -> PipelineState:
    print("\n[Step 6: DEPLOY] Deploying to S3 with compression...")

    # One prefix per build. Readers keep seeing the current origin until the
    # flip at the end, so an interrupted deploy is invisible to them.
    build_id = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    build_uri = f"{S3_URI}{BUILD_PREFIX}/{build_id}/"
    print(f"  build {build_id} -> {build_uri}")

    errors: list[str] = []
    client = _s3()
    prefix = f"{BUILD_PREFIX}/{build_id}/"

    # Every page carries the light/dark switch and its light-mode colours --
    # but the generators that rebuild the university, methodology and ask
    # pages do not write them, so each rebuild quietly stripped dark mode from
    # whatever it touched until someone remembered to re-run the theme script.
    # Deploy is the one step every page passes through, so it is applied here.
    # It is idempotent and takes well under a second.
    theme = subprocess.run([sys.executable, str(base_dir / "scripts" / "add_theme_toggle.py")],
                           cwd=base_dir, capture_output=True, text=True)
    if theme.returncode != 0:
        return state.with_outcome(StepOutcome.err(
            "deploy", message=f"theme pass failed: {theme.stderr.strip()[:200]}"))
    for line in theme.stdout.strip().splitlines():
        print(f"  {line.strip()}")

    # The pass above has twice written `--x: var(--x)` cycles -- 482 of them on
    # 2026-08-28, and one on 2026-09-14 that made the analytics spend chart
    # invisible in dark mode -- and both times the deploy published them,
    # because the check for exactly this ran only in check_consistency.py, not
    # between the pass and the upload. Nothing has been uploaded yet, so
    # refusing here costs a reader nothing.
    sys.path.insert(0, str(base_dir / "scripts"))
    from add_theme_toggle import self_referencing_tokens
    cycles = self_referencing_tokens(site_dir)
    if cycles:
        return state.with_outcome(StepOutcome.err(
            "deploy", message=(f"theme pass left self-referencing CSS tokens in "
                               f"{len(cycles)} file(s), e.g. {', '.join(cycles[:3])}; "
                               "nothing was published")))

    # What this build should contain -- one walk of site/, not an allowlist.
    plan = _plan_objects(site_dir)
    print(f"  {len(plan)} objects planned")

    # Seed from whatever CloudFront is serving right now, then overwrite only
    # what differs. A full upload is ~430 MB and, one `aws s3 cp` process per
    # file, took the better part of an hour; the copy below moves the same
    # bytes inside S3 in well under a minute and never touches the network
    # here.
    live = _live_build_id()
    prev_fps: dict[str, str] = {}
    if live:
        print(f"  seeding from live build {live}...", flush=True)
        ok, why = _seed_from(live, build_id)
        if ok:
            prev_fps = _load_manifest(client, live)
            if not prev_fps:
                print("    no manifest for it; re-uploading everything")
        else:
            # Not fatal: fall back to a full upload, which is what every
            # deploy did before this. Slow beats wrong.
            print(f"    seed failed ({why}); uploading in full")
    else:
        print("  no live build to seed from; uploading in full")

    # Fingerprints cover content AND headers, so a cache-rule change ships too.
    fps = {o.key: _fingerprint(o) for o in plan}
    changed = [o for o in plan if fps[o.key] != prev_fps.get(o.key)]
    print(f"  {len(changed)} changed, {len(plan) - len(changed)} reused")

    if changed:
        errors.extend(_put_many(client, changed, prefix))

    # Anything seeded in that this build no longer has must go, or the build
    # would serve files that were deleted from the site.
    landed = _list_keys(client, prefix)
    stale = sorted(landed - set(fps))
    if stale:
        print(f"  removing {len(stale)} file(s) no longer in the site")
        for batch in (stale[k:k + 1000] for k in range(0, len(stale), 1000)):
            client.delete_objects(
                Bucket=S3_BUCKET,
                Delete={"Objects": [{"Key": f"{prefix}{k}"} for k in batch]})
        landed -= set(stale)

    # Reconcile against the plan before anything is published. The count check
    # in _publish_build catches a badly truncated upload; this catches the one
    # missing file, which is the failure an incremental deploy can actually
    # produce -- a diff that wrongly decides something is unchanged omits it
    # silently, and it 404s the moment the origin moves.
    missing = sorted(set(fps) - landed)
    if missing:
        errors.append(f"{len(missing)} planned object(s) missing from the "
                      f"build, first: {', '.join(missing[:3])}")
    uploaded = len(fps)
    print(f"  build holds {len(landed)} objects "
          f"({len(changed)} uploaded, {len(plan) - len(changed)} copied)")

    # Publish, atomically.
    #
    # Nothing above this point is reachable by a reader. If the upload was
    # short, or any of it failed, the flip does not happen and the live site
    # is exactly what it was.
    if errors:
        print(f"  NOT publishing: {len(errors)} upload error(s); "
              f"the live site is untouched")
    else:
        ok, why = _publish_build(build_id, uploaded)
        if not ok:
            errors.append(f"publish failed: {why}")
        else:
            # Only now, once this build is the live one, does its manifest
            # become the thing the next deploy should diff against.
            try:
                _write_manifest(client, build_id, fps)
            except Exception as e:
                # The build is live and correct; the next deploy just loses
                # its shortcut and uploads in full.
                print(f"  WARNING: could not write manifest ({e}); "
                      f"the next deploy will be a full upload")
            _prune_old_builds(build_id)

    # Step 4: CloudFront invalidation
    print("  Invalidating CloudFront cache...")
    # Retried, because this has now failed twice on a transient endpoint
    # error after a perfectly good upload. It is the last step of a
    # fifteen-minute job and re-running the whole deploy to retry one API
    # call is a poor trade.
    cf_ok, cf_why = False, ""
    for attempt in range(1, 4):
        cf_result = subprocess.run(
            ["aws", "cloudfront", "create-invalidation",
             "--distribution-id", CLOUDFRONT_DISTRIBUTION,
             "--paths", "/*",
             "--profile", AWS_PROFILE],
            capture_output=True, text=True,
        )
        if cf_result.returncode == 0:
            cf_ok = True
            print(f"  CloudFront: invalidation started"
                  + (f" (attempt {attempt})" if attempt > 1 else ""))
            break
        cf_why = (cf_result.stderr or "").strip()[:160]
        print(f"  CloudFront: attempt {attempt} failed: {cf_why}")
        if attempt < 3:
            time.sleep(5 * attempt)
    if not cf_ok:
        # The build IS published at this point -- only the cache purge failed,
        # so readers get the new content once the 5-minute HTML TTL lapses.
        # Still a failure: something did not happen that was meant to.
        print("  CloudFront: FAILED after 3 attempts; content is published "
              "but cached copies will linger until TTL")
        errors.append(f"CloudFront invalidation failed: {cf_why}")

    data = {"uploaded": uploaded, "cloudfront": cf_ok, "errors": len(errors)}
    if errors:
        # success=False, not True. This branch previously reported success, so
        # on 2026-08-21 a deploy printed "1 succeeded, 0 failed" while EVERY
        # JSON upload failed on a malformed aws argv and nothing shipped. A
        # deploy that could not upload is not a successful deploy, and a
        # pipeline that cannot fail is not evidence when it passes.
        outcome = StepOutcome(
            step_name="deploy", university_key="", success=False,
            message=f"Deployed {uploaded} files but {len(errors)} upload(s) FAILED",
            data=data, errors=tuple(errors[:5]), warnings=(),
            timestamp=datetime.utcnow().isoformat(),
        )
    else:
        outcome = StepOutcome.ok(
            "deploy",
            message=f"Deployed: {uploaded} files (pre-compressed), CloudFront invalidated",
            data=data,
        )

    return state.with_outcome(outcome)
