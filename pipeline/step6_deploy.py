"""
Step 6: DEPLOY — Pre-compress, sync to S3, and invalidate CloudFront.

Pre-compresses JSON files with gzip before uploading for optimal performance.
Sets appropriate Cache-Control headers by file type.

Input:  site/ directory (HTML + JSON + assets)
Output: S3 bucket updated with compressed files, CloudFront cache invalidated
"""
from __future__ import annotations
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


def step6_deploy(state: PipelineState) -> PipelineState:
    """Deploy site to S3 with pre-compression and cache headers."""
    if state.should_halt():
        return state

    base_dir = state.config.base_dir
    site_dir = base_dir / "site"
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
                gz_path = _gzip_file(f)
                result = subprocess.run(
                    ["aws", "s3", "cp", str(gz_path), f"{S3_URI}{key}",
                     "--profile", AWS_PROFILE,
                     "--cache-control", CACHE_RULES.get(".json", "public, max-age=3600"),
                     "--content-type", "application/json",
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

    for mode in ["stem", "nonstem"]:
        data_dir = site_dir / "data" / mode
        if not data_dir.is_dir():
            continue
        for f in sorted(data_dir.glob("*.json")):
            key = f"data/{mode}/{f.name}"
            try:
                gz_path = _gzip_file(f)
                result = subprocess.run(
                    ["aws", "s3", "cp", str(gz_path), f"{S3_URI}{key}",
                     "--profile", AWS_PROFILE,
                     "--cache-control", CACHE_RULES.get(".json", "public, max-age=3600"),
                     "--content-type", "application/json",
                     "--content-encoding", "gzip"],
                    capture_output=True, text=True,
                )
                gz_path.unlink()  # Clean up temp gzip file
                if result.returncode == 0:
                    uploaded += 1
                else:
                    errors.append(f"Upload failed: {key}")
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
