# CloudFront hardening — denial-of-wallet protection

Written before any change was made. Records the state we started from, what
each step does, how to verify it, and how to undo it.

## The problem

The S3 bucket is reachable directly, bypassing CloudFront:

```
https://phd-demographics-andy-barr.s3.amazonaws.com/data/exports/stem_records.parquet
  -> HTTP 200, 16.6 MB
```

CloudFront's 1 TB/month free tier does **not** cover direct S3 requests. S3
egress bills at $0.09/GB from the first byte, so anyone who knows the bucket
name — it is visible in the distribution config — skips the free tier and bills
the account directly.

| Pulled via | 1 TB | 10 TB | 100 TB |
|---|---|---|---|
| CloudFront (cached) | $0 | ~$783 | ~$8,700 |
| **Direct to S3** | **~$92** | **~$922** | **~$9,216** |

One host on a gigabit line sustains roughly a terabyte a day. No botnet needed.

Existing guardrails are six CloudWatch billing alarms ($20/$40/$50/$70/$100/
$200). They notify. They do not stop anything.

## What we are NOT doing

**No spend cap, and no throttle that can take the site down.** The point is to
survive attention, not to switch off under it. Specifically:

- No AWS Budget *action* that disables the distribution.
- No global request cap.
- `PriceClass_All` is kept, so the page stays fast worldwide. A cheaper price
  class would cut worst-case egress cost but degrade reach, which is the wrong
  trade for a page whose purpose is to be read.

The WAF rate limit in step 2 is per-IP and set far above human browsing rates.
A reader cannot trip it; a scraper hammering one file will.

## Starting state (backed up)

Backups in `backup/`, stamped `20260819T235425Z`:

- `dist-config-*.json` — full distribution config, and the `ETag` every update
  must quote
- `bucket-policy-*.json`, `public-access-block-*.json`, `bucket-website-*.json`

```
distribution   E3IYHYCEQPE00Q
ETag           E23ZP02F085DFQ
origin id      S3-phd-demographics-andy-barr
origin domain  phd-demographics-andy-barr.s3-website-us-east-1.amazonaws.com   <- website endpoint
price class    PriceClass_All
alias          phd-demographics.andy-barr.com
public access  all four blocks FALSE (bucket is world-readable)
WAF            none
```

## Why the fix is low-risk here

Locking a bucket to CloudFront needs Origin Access Control, which requires the
S3 **REST** endpoint. Switching away from the **website** endpoint normally
breaks directory-index URLs (`/foo/` serving `/foo/index.html`) and any
website-endpoint redirect rules.

Checked before planning this: the site has **no** directory-style links. Every
href is an explicit `.html` path, and the root is handled by CloudFront's own
`DefaultRootObject: index.html`. There are no custom error responses to
preserve. So the usual blocker does not apply.

## Steps

Each step is applied alone and verified before the next. Order matters: WAF
first would leave the S3 hole open; OAC first closes the hole even if later
steps are abandoned.

### Step 1 — Origin Access Control, and block public S3 access

Closes the actual hole. After this, S3 serves only requests signed by this
distribution.

1. Create an OAC (SigV4, always sign).
2. Point the origin at the REST endpoint
   `phd-demographics-andy-barr.s3.us-east-1.amazonaws.com`, attach the OAC,
   and drop `CustomOriginConfig` in favour of `S3OriginConfig`.
3. Replace the bucket policy with one allowing `s3:GetObject` **only** to
   `cloudfront.amazonaws.com` with a `AWS:SourceArn` condition naming this
   distribution.
4. Turn on all four public-access blocks.

**Verify**

```bash
curl -sI https://phd-demographics.andy-barr.com/            # must stay 200
curl -sI https://phd-demographics-andy-barr.s3.amazonaws.com/index.html   # must become 403
curl -sI https://phd-demographics.andy-barr.com/universities/mit.html     # 200
curl -sI https://phd-demographics.andy-barr.com/data/exports/stem_records.parquet  # 200
```

**Rollback** — restore the website-endpoint origin from the backup config,
re-open public access, and reapply the saved bucket policy. The site is served
from cache while the distribution redeploys, so a bad step degrades slowly
rather than instantly.

### Step 2 — WAF rate limiting

AWS WAF WebACL in `us-east-1` (CloudFront requires that region), one
rate-based rule: **2,000 requests per IP per 5 minutes**, action `Block`.

That is roughly 400 requests/minute from a single address. Ordinary reading is
a few dozen requests per page load, so a person browsing hard stays two orders
of magnitude below it. A scraper pulling the 16.6 MB Parquet in a loop does not.

Cost: ~$5/month for the WebACL, $1/rule, $0.60 per million requests inspected.

**Verify** — WebACL associated; the site still serves; the rule shows in
`get-web-acl`.

**Rollback** — disassociate the WebACL from the distribution. One call.

### Step 3 — Budget notification (alerting only)

An AWS Budget at a monthly threshold with **notifications only, no action**.
The existing CloudWatch billing alarms fire on total account spend; a budget
scoped to this project's services gives earlier, more specific warning.

Explicitly no `budgets:CreateBudgetAction` — nothing that can disable serving.

## After

Re-run `python3 scripts/test_site.py` — all 40 checks must still pass, including
the live link sweep, which exercises the CloudFront path end to end.

## What this does and does not protect against

**Does:** direct-to-S3 billing attacks, single-source request floods, scraping
loops on the large exports.

**Does not:** a genuine distributed flood through CloudFront from thousands of
addresses, each staying under the per-IP limit. That is what AWS Shield
Advanced exists for, at $3,000/month, which is not proportionate here. What
keeps that survivable is the free tier plus a high cache-hit ratio — and the
fact that CloudFront absorbs it rather than the origin.

**Worth knowing:** AWS does not automatically forgive denial-of-wallet bills.
People have had them waived by asking support. It is a favour, not a policy.


---

## Applied — 2026-08-19

All three steps executed and verified. No outage: the bucket stayed public
until after the distribution finished deploying on the new origin, so there was
never a window where CloudFront pointed at an endpoint it could not read.

### Result

```
direct S3 (REST endpoint)     403   was 200
direct S3 (website endpoint)  403   was 200
site via CloudFront           200   0.19s
large Parquet export          200   (through CloudFront only)
10 rapid requests             10/10 200   rate limit does not touch readers
```

### What is now in place

| Control | Value |
|---|---|
| Origin | `phd-demographics-andy-barr.s3.us-east-1.amazonaws.com` (REST) |
| Origin Access Control | `E32WHB7UUF2ZJS`, sigv4, always sign |
| Bucket policy | `s3:GetObject` to `cloudfront.amazonaws.com` only, conditioned on this distribution's ARN |
| Public ACL blocks | `BlockPublicAcls` and `IgnorePublicAcls` on |
| WAF WebACL | `phd-demographics-protection` — per-IP, 2000 req / 5 min, Block |
| Budget | `phd-demographics-monthly`, $150, alerts at 60% actual and 100% forecast, **no action** |

`BlockPublicPolicy` and `RestrictPublicBuckets` are deliberately left off: S3's
classifier reads the OAC policy as "public" because its principal is a service,
and switching them on would reject the very policy that locks the bucket down.
The ACL blocks are the meaningful ones here.

### Rollback

Restore the origin from `backup/dist-config-20260819T235425Z.json` (website
endpoint, `CustomOriginConfig`, no `OriginAccessControlId`), reapply
`backup/bucket-policy-20260819T235425Z.json`, and set all four public-access
blocks back to false. To drop only the rate limit, clear `WebACLId` on the
distribution — one update, no bucket change.

### Residual risk

A genuinely distributed flood through CloudFront, thousands of addresses each
staying under 2000 requests per five minutes, is still possible and is not
addressed here. Shield Advanced covers that at $3,000/month, which is not
proportionate. What makes it survivable instead: everything is cached at the
edge, the origin is no longer reachable directly, and CloudFront absorbs the
requests rather than S3 billing for them.

Re-verify any time with `python3 scripts/test_site.py` (40 checks, exercises the
CloudFront path end to end) plus the two 403 checks above.
