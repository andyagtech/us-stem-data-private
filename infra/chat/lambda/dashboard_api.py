"""
Dashboard API — read-only access to chat logs for the admin analytics page.
Returns recent chat interactions, aggregated stats, and tool usage.
"""
import json
import logging
import os
import time
from decimal import Decimal

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_table = None


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o == int(o) else float(o)
        return super().default(o)


def _get_table():
    global _table
    if not _table:
        _table = boto3.resource("dynamodb", region_name="us-east-1").Table(
            os.environ.get("CHAT_LOGS_TABLE", "phd-chat-logs")
        )
    return _table


def _cors():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://phd-demographics.andy-barr.com",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "content-type",
    }


def handler(event, context):
    cors = _cors()

    # Simple bearer token auth from query param
    params = event.get("queryStringParameters") or {}
    token = params.get("token", "")
    expected = os.environ.get("DASHBOARD_TOKEN", "")
    if expected and token != expected:
        return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Unauthorized"})}

    action = params.get("action", "recent")
    days = min(int(params.get("days", "7")), 90)

    table = _get_table()

    if action == "recent":
        # Get recent logs (last N days)
        items = []
        now = time.time()
        for d in range(days):
            day = time.strftime("%Y-%m-%d", time.gmtime(now - d * 86400))
            resp = table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key("pk").eq(day),
                ScanIndexForward=False,
                Limit=100,
            )
            items.extend(resp.get("Items", []))
            if len(items) >= 500:
                break

        # Sort by timestamp descending
        items.sort(key=lambda x: x.get("epoch", 0), reverse=True)

        return {
            "statusCode": 200,
            "headers": cors,
            "body": json.dumps({"logs": items[:500], "days": days}, cls=DecimalEncoder),
        }

    elif action == "stats":
        # Aggregate stats over the period
        total = 0
        by_day = {}
        tool_counts = {"navigate": 0, "query": 0, "none": 0}
        unique_ips = set()
        total_latency = 0

        now = time.time()
        for d in range(days):
            day = time.strftime("%Y-%m-%d", time.gmtime(now - d * 86400))
            resp = table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key("pk").eq(day),
            )
            day_items = resp.get("Items", [])
            by_day[day] = len(day_items)
            total += len(day_items)

            for item in day_items:
                unique_ips.add(item.get("ip", ""))
                total_latency += int(item.get("latency_ms", 0))
                for tool in item.get("tools_used", ["none"]):
                    tool_counts[tool] = tool_counts.get(tool, 0) + 1

        avg_latency = int(total_latency / total) if total > 0 else 0

        return {
            "statusCode": 200,
            "headers": cors,
            "body": json.dumps({
                "total_chats": total,
                "unique_ips": len(unique_ips),
                "avg_latency_ms": avg_latency,
                "by_day": by_day,
                "tool_usage": tool_counts,
                "days": days,
            }, cls=DecimalEncoder),
        }

    return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}
