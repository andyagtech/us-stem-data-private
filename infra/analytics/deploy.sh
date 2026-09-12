#!/bin/bash
# Deploy the analytics Lambda (phd-analytics) with its IP -> country table.
# Usage: ./deploy.sh
set -euo pipefail

FUNCTION="${FUNCTION:-phd-analytics}"
REGION="us-east-1"
PROFILE="personal"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${PHD_REPO:-$HOME/usds_china}"
IP_TABLE="$REPO/data/geo/ip_country.bin"

echo "=== analytics -> $FUNCTION ==="

# There was no deploy path for this function at all: the repo copy had been
# hardened to require ANALYTICS_PASSWORD and the live copy still carried a
# 'changeme' default, because nothing had ever shipped it. Hence this script.
if [[ ! -f "$IP_TABLE" ]]; then
    echo "ERROR: $IP_TABLE is missing."
    echo "       Run: python3 $REPO/scripts/build_ip_country_table.py"
    exit 1
fi

# The table is what makes country resolution work; ship it beside the handler.
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
cp "$SCRIPT_DIR/analytics_lambda.py" "$BUILD/"
cp "$IP_TABLE" "$BUILD/ip_country.bin"
python3 - "$BUILD" <<'PYEOF'
import ast, os, sys
d = sys.argv[1]
ast.parse(open(os.path.join(d, "analytics_lambda.py")).read())   # refuse to ship a syntax error
n = os.path.getsize(os.path.join(d, "ip_country.bin"))
if n < 500_000:
    sys.exit(f"ip_country.bin is only {n} bytes; the registry parse probably failed")
print(f"  handler parses, country table {n/1024:.0f} KB")
PYEOF

(cd "$BUILD" && zip -qr package.zip analytics_lambda.py ip_country.bin)
echo "  package $(du -h "$BUILD/package.zip" | cut -f1)"

aws lambda update-function-code \
    --function-name "$FUNCTION" --region "$REGION" --profile "$PROFILE" \
    --zip-file "fileb://$BUILD/package.zip" --output text \
    --query '[LastModified,CodeSize]'

aws lambda wait function-updated \
    --function-name "$FUNCTION" --region "$REGION" --profile "$PROFILE"

# The reader walks up to 90 days of rollup rows; 15s was set when it read raw
# events for a much smaller table.
aws lambda update-function-configuration \
    --function-name "$FUNCTION" --region "$REGION" --profile "$PROFILE" \
    --timeout 30 --memory-size 512 --output text --query '[Timeout,MemorySize]'
aws lambda wait function-updated \
    --function-name "$FUNCTION" --region "$REGION" --profile "$PROFILE"

echo "  deployed. Dashboard: https://phd-demographics.andy-barr.com/analytics.html"
