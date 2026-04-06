#!/bin/bash
# Deploy the PhD Demographics chat assistant to AWS
# Usage: ./deploy.sh [dev|prod]
set -euo pipefail

ENV="${1:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== PhD Demographics Chat Assistant ==="
echo "Environment: $ENV"
echo "Region: us-east-1"
echo "Profile: personal"
echo ""

# Validate SAM CLI is installed
if ! command -v sam &>/dev/null; then
    echo "ERROR: AWS SAM CLI is required. Install: brew install aws-sam-cli"
    exit 1
fi

# Build
echo "Building Lambda package..."
cd "$SCRIPT_DIR"
sam build \
    --template-file template.yaml \
    --profile personal

# Deploy
echo ""
echo "Deploying to AWS..."
sam deploy \
    --template-file .aws-sam/build/template.yaml \
    --config-file samconfig.toml \
    --profile personal \
    --parameter-overrides "Environment=$ENV" \
    --no-fail-on-empty-changeset

# Get the function URL
echo ""
echo "=== Deployment Complete ==="
CHAT_URL=$(aws cloudformation describe-stacks \
    --stack-name "phd-demographics-chat" \
    --profile personal \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`ChatEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "UNKNOWN")

echo "Chat Endpoint: $CHAT_URL"
echo ""
echo "IMPORTANT: Update the CHAT_ENDPOINT in site/chat-widget.js with this URL"
echo "Then deploy the site: python -m pipeline run --step deploy"
