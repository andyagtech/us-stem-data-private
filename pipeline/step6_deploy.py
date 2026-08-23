"""
Step 6: DEPLOY — Pre-compress, sync to S3, and invalidate CloudFront.

Pre-compresses JSON files with gzip before uploading for optimal performance.
Sets appropriate Cache-Control headers by file type.

Input:  site/ directory (HTML + JSON + assets)
Output: S3 bucket updated with compressed files, CloudFront cache invalidated
"""
from __future__ import annotations
import errno
import fcntl
import gzip
import json
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path

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
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".js": "application/javascript",
    ".css": "text/css; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpeg": "image/jpeg",
}


def _gzip_file(src: Path) -> Path:
    """Gzip a file, return path to the compressed version."""
    gz_path = src.with_suffix(src.suffix + ".gz")
    with open(src, "rb") as f_in:
        with gzip.open(str(gz_path), "wb", compresslevel=9) as f_out:
            f_out.write(f_in.read())
    return gz_path


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

    uploaded = 0
    errors = []

    # Step 1: Upload HTML files (uncompressed, short cache)
    print("  Uploading HTML files...")
    for f in site_dir.glob("*.html"):
        key = f.name
        cache = CACHE_RULES.get(".html", "public, max-age=300")
        ctype = CONTENT_TYPES.get(".html", "text/html")
        result = subprocess.run(
            ["aws", "s3", "cp", str(f), f"{build_uri}{key}",
             "--profile", AWS_PROFILE,
             "--cache-control", cache,
             "--content-type", ctype],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            uploaded += 1

    # Step 1b: Upload pre-rendered university pages (gzipped for bandwidth)
    universities_dir = site_dir / "universities"
    if universities_dir.is_dir():
        print("  Pre-compressing and uploading university pages...")
        for mode_dir in [universities_dir, universities_dir / "nonstem"]:
            if not mode_dir.is_dir():
                continue
            rel_prefix = "universities/" if mode_dir == universities_dir else "universities/nonstem/"
            for f in sorted(mode_dir.glob("*.html")):
                key = f"{rel_prefix}{f.name}"
                try:
                    gz_path = _gzip_file(f)
                    result = subprocess.run(
                        ["aws", "s3", "cp", str(gz_path), f"{build_uri}{key}",
                         "--profile", AWS_PROFILE,
                         "--cache-control", CACHE_RULES.get(".html", "public, max-age=300"),
                         "--content-type", "text/html; charset=utf-8",
                         "--content-encoding", "gzip"],
                        capture_output=True, text=True,
                    )
                    gz_path.unlink()
                    if result.returncode == 0:
                        uploaded += 1
                    else:
                        errors.append(f"Upload failed: {key}")
                except Exception as e:
                    errors.append(f"Compress/upload failed: {key}: {e}")

    # Step 1c: Upload sitemap.xml
    sitemap_path = site_dir / "sitemap.xml"
    if sitemap_path.exists():
        result = subprocess.run(
            ["aws", "s3", "cp", str(sitemap_path), f"{build_uri}sitemap.xml",
             "--profile", AWS_PROFILE,
             "--cache-control", "public, max-age=3600",
             "--content-type", "application/xml"],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            uploaded += 1

    # Step 2: Upload JSON data files (pre-compressed with gzip)
    print("  Pre-compressing and uploading JSON data...")

    # Top-level data/*.json (e.g., universities_index.json)
    top_data_dir = site_dir / "data"
    if top_data_dir.is_dir():
        for f in sorted(top_data_dir.glob("*.json")):
            key = f"data/{f.name}"
            try:
                ok, why = _upload_json(f, key, build_uri)
                if ok:
                    uploaded += 1
                else:
                    errors.append(f"Upload failed: {key} {why}")
            except Exception as e:
                errors.append(f"Upload failed: {key}: {e}")

    # "chat" belongs here: chat-widget.js fetches /data/chat/site_map.json at
    # runtime to validate the nav paths the assistant emits. It was omitted, so
    # that fetch had always 403'd and the widget silently ran without a site
    # map -- degrading rather than failing, which is why nobody noticed.
    for mode in ["stem", "nonstem", "chat"]:
        data_dir = site_dir / "data" / mode
        if not data_dir.is_dir():
            continue
        for f in sorted(data_dir.glob("*.json")):
            key = f"data/{mode}/{f.name}"
            try:
                ok, why = _upload_json(f, key, build_uri)
                if ok:
                    uploaded += 1
                else:
                    errors.append(f"Upload failed: {key} {why}")
            except Exception as e:
                errors.append(f"Compress/upload failed: {key}: {e}")

    # Step 2b: Upload Parquet data files (for SQL query page)
    exports_dir = site_dir / "data" / "exports"
    if exports_dir.is_dir():
        print("  Uploading Parquet exports...")
        for f in sorted(exports_dir.glob("*.parquet")):
            key = f"data/exports/{f.name}"
            result = subprocess.run(
                ["aws", "s3", "cp", str(f), f"{build_uri}{key}",
                 "--profile", AWS_PROFILE,
                 "--cache-control", "public, max-age=3600",
                 "--content-type", "application/octet-stream"],
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                uploaded += 1

    # Step 3: Upload static assets
    print("  Uploading static assets...")
    # .css was missing from this list, so /style.css was never uploaded and
    # returned 403 -- taking the design tokens with it. Five pages that style
    # themselves through var(--bg) and var(--text) rendered as black-on-white
    # browser defaults while the index, which inlines its own CSS, rendered
    # dark. Same site, two looks, depending which page you landed on.
    for ext in [".ico", ".png", ".js", ".jpeg", ".css"]:
        for f in site_dir.glob(f"*{ext}"):
            key = f.name
            cache = CACHE_RULES.get(ext, "public, max-age=604800")
            ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
            result = subprocess.run(
                ["aws", "s3", "cp", str(f), f"{build_uri}{key}",
                 "--profile", AWS_PROFILE,
                 "--cache-control", cache,
                 "--content-type", ctype],
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                uploaded += 1

    # Step 3b: OpenGraph share cards, which live in a subdirectory.
    # Every glob above is top-level only, so site/og/**.png would never have
    # shipped — and since every page's og:image now points into it, a share
    # would have rendered a 404 rather than the static image it replaced.
    # Synced in one call rather than a subprocess per file; there are 237.
    og_dir = site_dir / "og"
    if og_dir.is_dir():
        card_count = sum(1 for _ in og_dir.rglob("*.png"))
        print(f"  Uploading {card_count} OpenGraph cards...")
        result = subprocess.run(
            ["aws", "s3", "sync", str(og_dir), f"{build_uri}og/",
             "--profile", AWS_PROFILE,
             "--exclude", "*", "--include", "*.png",
             "--cache-control", CACHE_RULES.get(".png", "public, max-age=604800"),
             "--content-type", CONTENT_TYPES.get(".png", "image/png"),
             "--no-progress"],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            uploaded += card_count
        else:
            errors.append(f"og cards: {result.stderr.strip()[:200]}")

    print(f"  Uploaded {uploaded} files")

    # Step 3a: sweep up anything the typed steps above did not cover.
    #
    # A versioned build has to be COMPLETE. Before the origin flip, files the
    # deploy did not know about still worked, because they survived at the
    # bucket root from whenever they were last put there -- catalog.json and
    # llms.txt had sat there since March. The moment the origin points at one
    # build, anything missing from that build is a 404. Ten files were in that
    # position, including the stylesheet five pages depend on.
    #
    # So rather than extend the extension allowlist again, upload whatever is
    # left. An allowlist is a promise to remember, and this is the second time
    # it was not kept.
    print("  Sweeping any remaining site files...")
    # Ask S3 what actually landed rather than trusting a tally kept by hand
    # across eight upload steps. If a typed step silently failed, its file
    # shows up here as missing and gets uploaded, which is the behaviour worth
    # having.
    listing = subprocess.run(
        ["aws", "s3", "ls", build_uri, "--recursive", "--profile", AWS_PROFILE],
        capture_output=True, text=True)
    prefix = build_uri.split(f"{S3_BUCKET}/", 1)[1]
    present = {l.split()[-1][len(prefix):] for l in listing.stdout.splitlines()
               if l.strip()} if listing.returncode == 0 else set()
    swept = 0
    for f in sorted(site_dir.rglob("*")):
        if not f.is_file() or f.name.startswith("."):
            continue
        rel = f.relative_to(site_dir).as_posix()
        if rel in present:
            continue
        ext = f.suffix.lower()
        r = subprocess.run(
            ["aws", "s3", "cp", str(f), f"{build_uri}{rel}",
             "--profile", AWS_PROFILE,
             "--cache-control", CACHE_RULES.get(ext, "public, max-age=3600"),
             "--content-type", CONTENT_TYPES.get(ext, "application/octet-stream")],
            capture_output=True, text=True)
        if r.returncode == 0:
            uploaded += 1
            swept += 1
        else:
            errors.append(f"sweep {rel}: {r.stderr.strip()[:100]}")
    print(f"    swept {swept} file(s) the typed steps missed")

    # Step 3b: publish, atomically.
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
