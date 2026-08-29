#!/usr/bin/env bash
# CloudWatch alarms on what the chat actually costs.
#
# The AWS budget does not see this: OpenAI is billed directly, outside AWS,
# and until these existed nothing watched it at all. The handler emits EMF
# metrics in the PhdChat namespace; these turn them into notifications.
#
# Run once. Idempotent -- put-metric-alarm overwrites by name.
#
#   ./infra/chat_cost_alarms.sh <sns-topic-arn>
set -euo pipefail

TOPIC="${1:-}"
REGION="${AWS_REGION:-us-east-1}"
PROFILE="${AWS_PROFILE:-personal}"
NS=PhdChat

if [ -z "$TOPIC" ]; then
  echo "usage: $0 <sns-topic-arn>" >&2
  echo "  create one with: aws sns create-topic --name phd-chat-alerts" >&2
  exit 2
fi

alarm() {
  local name="$1" metric="$2" threshold="$3" period="$4" stat="$5" desc="$6"
  aws cloudwatch put-metric-alarm \
    --alarm-name "$name" \
    --namespace "$NS" --metric-name "$metric" \
    --statistic "$stat" --period "$period" --evaluation-periods 1 \
    --threshold "$threshold" --comparison-operator GreaterThanThreshold \
    --treat-missing-data notBreaching \
    --alarm-description "$desc" \
    --alarm-actions "$TOPIC" \
    --region "$REGION" --profile "$PROFILE"
  echo "  set $name"
}

# Spend. 1M prompt tokens an hour is far above normal traffic and well below
# a number worth losing sleep over; tune once real usage is visible.
alarm phd-chat-prompt-tokens-hourly PromptTokens 1000000 3600 Sum \
  "Prompt tokens in an hour. The main cost driver."
alarm phd-chat-completion-tokens-hourly CompletionTokens 200000 3600 Sum \
  "Completion tokens in an hour."
alarm phd-chat-model-calls-hourly ModelCalls 2000 3600 Sum \
  "Model calls in an hour, cache misses included."

# The caps firing at all is worth knowing about: it means real traffic hit a
# ceiling, or something is abusing the endpoint.
alarm phd-chat-daily-cap-soft DailyCapSoft 0 3600 Sum \
  "The daily soft cap is turning away new questions."
alarm phd-chat-daily-cap-hard DailyCapHard 0 3600 Sum \
  "The daily hard cap is refusing requests."

# A limiter that is down is an open tab.
alarm phd-chat-limiter-errors RateLimiterError 10 900 Sum \
  "The per-IP rate limiter is erroring; it fails open until the strike count."
alarm phd-chat-limiter-fail-closed RateLimiterFailClosed 0 900 Sum \
  "The limiter has failed closed after repeated errors. Requests are refused."

echo "done. Subscribe to the topic if you have not:"
echo "  aws sns subscribe --topic-arn $TOPIC --protocol email --notification-endpoint you@example.com"
