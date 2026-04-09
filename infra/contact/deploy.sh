#!/bin/bash
# Deploy the PhD Demographics contact-form Lambda
# Usage: ./deploy.sh [dev|prod]
set -euo pipefail

ENV="${1:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== PhD Demographics Contact Form ==="
echo "Environment: $ENV"
echo ""

if ! command -v sam &>/dev/null; then
    echo "ERROR: AWS SAM CLI is required. brew install aws-sam-cli"
    exit 1
fi

cd "$SCRIPT_DIR"
echo "Building Lambda package..."
sam build --template-file template.yaml --profile personal

echo ""
echo "Deploying to AWS..."
sam deploy \
    --template-file .aws-sam/build/template.yaml \
    --stack-name phd-demographics-contact \
    --s3-prefix phd-demographics-contact \
    --resolve-s3 \
    --region us-east-1 \
    --profile personal \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --parameter-overrides "Environment=$ENV AllowedOrigin=https://phd-demographics.andy-barr.com SenderEmail=tipline@andy-barr.com RecipientEmail=andybarr@protonmail.com" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

echo ""
echo "=== Deployment Complete ==="
URL=$(aws cloudformation describe-stacks \
    --stack-name "phd-demographics-contact" \
    --profile personal \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`ContactEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "UNKNOWN")
echo "Contact Endpoint: $URL"
echo ""
echo "Update CONTACT_ENDPOINT in site/submit.html with this URL."
