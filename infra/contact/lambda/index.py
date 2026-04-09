"""
PhD Demographics Contact Form — Lambda handler.

Receives a contact-form POST and emails it to the site owner via SES.
- Origin-locked CORS
- Per-IP rate limiting (3 submissions / 10 minutes)
- Input length caps + basic sanitization
- No HTML in outbound email (plain text only)
"""
import json
import logging
import os
import time

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://phd-demographics.andy-barr.com")
RECIPIENT_EMAIL = os.environ["RECIPIENT_EMAIL"]
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
RATE_LIMIT_TABLE = os.environ["RATE_LIMIT_TABLE"]

MAX_NAME = 200
MAX_EMAIL = 200
MAX_SUBJECT = 300
MAX_MESSAGE = 5000
RATE_LIMIT = 3           # submissions
RATE_WINDOW = 600        # per 10 minutes

ses = boto3.client("ses", region_name="us-east-1")
ddb = boto3.client("dynamodb", region_name="us-east-1")


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Content-Type": "application/json",
    }


def _resp(status, body):
    return {"statusCode": status, "headers": _cors_headers(), "body": json.dumps(body)}


def _client_ip(event):
    ctx = event.get("requestContext") or {}
    http = ctx.get("http") or {}
    return http.get("sourceIp") or "unknown"


def _rate_limited(ip):
    now = int(time.time())
    pk = f"contact#{ip}#{now // RATE_WINDOW}"
    try:
        r = ddb.update_item(
            TableName=RATE_LIMIT_TABLE,
            Key={"pk": {"S": pk}},
            UpdateExpression="ADD #c :one SET #t = if_not_exists(#t, :ttl)",
            ExpressionAttributeNames={"#c": "count", "#t": "ttl"},
            ExpressionAttributeValues={
                ":one": {"N": "1"},
                ":ttl": {"N": str(now + RATE_WINDOW * 2)},
            },
            ReturnValues="UPDATED_NEW",
        )
        count = int(r["Attributes"]["count"]["N"])
        return count > RATE_LIMIT
    except ClientError as e:
        logger.warning("rate limit check failed: %s", e)
        return False


def _clean(s, cap):
    if s is None:
        return ""
    s = str(s).strip()
    # Strip control chars except newline/tab
    s = "".join(ch for ch in s if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    return s[:cap]


def _valid_email(s):
    if not s or "@" not in s or len(s) > MAX_EMAIL:
        return False
    local, _, domain = s.rpartition("@")
    return bool(local) and "." in domain and " " not in s


def handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or "").upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": _cors_headers(), "body": ""}
    if method != "POST":
        return _resp(405, {"error": "method not allowed"})

    ip = _client_ip(event)
    if _rate_limited(ip):
        return _resp(429, {"error": "Too many submissions. Please try again later."})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _resp(400, {"error": "invalid JSON"})

    # Honeypot — bots fill this; humans don't see it
    if body.get("website"):
        logger.info("honeypot tripped from %s", ip)
        return _resp(200, {"ok": True})

    name = _clean(body.get("name"), MAX_NAME)
    email = _clean(body.get("email"), MAX_EMAIL)
    subject = _clean(body.get("subject"), MAX_SUBJECT) or "(no subject)"
    message = _clean(body.get("message"), MAX_MESSAGE)

    if not message:
        return _resp(400, {"error": "message is required"})
    if email and not _valid_email(email):
        return _resp(400, {"error": "invalid email address"})

    text_body = (
        f"From: {name or '(anonymous)'}\n"
        f"Email: {email or '(not provided)'}\n"
        f"IP: {ip}\n"
        f"Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
        f"Subject: {subject}\n"
        f"\n"
        f"{message}\n"
    )

    try:
        kwargs = {
            "Source": SENDER_EMAIL,
            "Destination": {"ToAddresses": [RECIPIENT_EMAIL]},
            "Message": {
                "Subject": {"Data": f"[phd-demographics] {subject}"[:300]},
                "Body": {"Text": {"Data": text_body}},
            },
        }
        if email and _valid_email(email):
            kwargs["ReplyToAddresses"] = [email]
        ses.send_email(**kwargs)
    except ClientError as e:
        logger.error("SES send failed: %s", e)
        return _resp(500, {"error": "failed to send message"})

    # Auto-confirmation reply to the submitter (best-effort, non-blocking)
    if email and _valid_email(email):
        confirm_body = (
            f"Hi{' ' + name if name else ''},\n"
            f"\n"
            f"Thanks for your tip — your message has been received and forwarded\n"
            f"to Andy Barr. If a reply is needed, you'll hear back at this address.\n"
            f"\n"
            f"For reference, here's what you sent:\n"
            f"\n"
            f"  Subject: {subject}\n"
            f"\n"
            f"  {message}\n"
            f"\n"
            f"--\n"
            f"phd-demographics.andy-barr.com\n"
            f"This is an automated confirmation. Reply to this email to reach Andy.\n"
        )
        try:
            ses.send_email(
                Source=SENDER_EMAIL,
                Destination={"ToAddresses": [email]},
                ReplyToAddresses=[RECIPIENT_EMAIL],
                Message={
                    "Subject": {"Data": "Thanks for your tip — phd-demographics.andy-barr.com"},
                    "Body": {"Text": {"Data": confirm_body}},
                },
            )
        except ClientError as e:
            logger.warning("auto-confirmation send failed (non-fatal): %s", e)

    return _resp(200, {"ok": True})
