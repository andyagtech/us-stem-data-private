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
import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from .state import PipelineState, StepOutcome


S3_BUCKET = os.environ.get("S3_BUCKET", "phd-demographics-andy-barr")
S3_URI = f"s3://{S3_BUCKET}/"
CLOUDFRONT_DISTRIBUTION = os.environ.get("CLOUDFRONT_DISTRIBUTION", "E3IYHYCEQPE00Q")
AWS_PROFILE = os.environ.get("AWS_PROFILE", "personal")

# Cache-Control by file type
CACHE_RULES = {
    ".html": "public, max-age=300, stale-while-revalidate=86400",  # 5 min + stale ok for 24h
    ".json": "public, max-age=3600",  # 1 hour
    ".js": "public, max-age=300, stale-while-revalidate=86400",  # 5 min + stale ok for 24h
    ".ico": "public, max-age=604800",
    ".png": "public, max-age=604800",
    ".jpeg": "public, max-age=604800",
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".js": "application/javascript",
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

    uploaded = 0
    errors = []

    # Step 1: Upload HTML files (uncompressed, short cache)
    print("  Uploading HTML files...")
    for f in site_dir.glob("*.html"):
        key = f.name
        cache = CACHE_RULES.get(".html", "public, max-age=300")
        ctype = CONTENT_TYPES.get(".html", "text/html")
        result = subprocess.run(
            ["aws", "s3", "cp", str(f), f"{S3_URI}{key}",
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
                        ["aws", "s3", "cp", str(gz_path), f"{S3_URI}{key}",
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
            ["aws", "s3", "cp", str(sitemap_path), f"{S3_URI}sitemap.xml",
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
                ok, why = _upload_json(f, key, S3_URI)
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
                ok, why = _upload_json(f, key, S3_URI)
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
                ["aws", "s3", "cp", str(f), f"{S3_URI}{key}",
                 "--profile", AWS_PROFILE,
                 "--cache-control", "public, max-age=3600",
                 "--content-type", "application/octet-stream"],
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                uploaded += 1

    # Step 3: Upload static assets
    print("  Uploading static assets...")
    for ext in [".ico", ".png", ".js", ".jpeg"]:
        for f in site_dir.glob(f"*{ext}"):
            key = f.name
            cache = CACHE_RULES.get(ext, "public, max-age=604800")
            ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
            result = subprocess.run(
                ["aws", "s3", "cp", str(f), f"{S3_URI}{key}",
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
            ["aws", "s3", "sync", str(og_dir), f"{S3_URI}og/",
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

    # Step 4: CloudFront invalidation
    print("  Invalidating CloudFront cache...")
    cf_result = subprocess.run(
        ["aws", "cloudfront", "create-invalidation",
         "--distribution-id", CLOUDFRONT_DISTRIBUTION,
         "--paths", "/*",
         "--profile", AWS_PROFILE],
        capture_output=True, text=True,
    )

    cf_ok = cf_result.returncode == 0
    if cf_ok:
        print("  CloudFront: invalidation started")
    else:
        print(f"  CloudFront: FAILED")
        errors.append("CloudFront invalidation failed")

    data = {"uploaded": uploaded, "cloudfront": cf_ok, "errors": len(errors)}
    if errors:
        outcome = StepOutcome(
            step_name="deploy", university_key="", success=True,
            message=f"Deployed {uploaded} files ({len(errors)} errors)",
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
