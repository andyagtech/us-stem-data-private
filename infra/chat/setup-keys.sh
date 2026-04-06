#!/bin/bash
# Store API keys in AWS SSM Parameter Store (encrypted)
# Usage: ./setup-keys.sh
# You'll be prompted for each key.
set -euo pipefail

PROFILE="personal"
REGION="us-east-1"

echo "=== Store API Keys in SSM Parameter Store ==="
echo "These are stored encrypted (SecureString) and never exposed."
echo ""

read -sp "OpenAI API Key: " OPENAI_KEY
echo ""
read -sp "OpenRouter API Key: " OPENROUTER_KEY
echo ""

echo "Storing OpenAI key..."
aws ssm put-parameter \
    --name "/phd-demographics/openai-api-key" \
    --type SecureString \
    --value "$OPENAI_KEY" \
    --overwrite \
    --profile "$PROFILE" \
    --region "$REGION"

echo "Storing OpenRouter key..."
aws ssm put-parameter \
    --name "/phd-demographics/openrouter-api-key" \
    --type SecureString \
    --value "$OPENROUTER_KEY" \
    --overwrite \
    --profile "$PROFILE" \
    --region "$REGION"

echo ""
echo "Done! Keys stored at:"
echo "  /phd-demographics/openai-api-key"
echo "  /phd-demographics/openrouter-api-key"
echo ""
echo "Now run: ./deploy.sh prod"
