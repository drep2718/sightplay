#!/bin/bash
# deploy.sh — Build, package, upload to S3, and trigger an ASG rolling refresh.
#
# Usage:
#   ./infra/scripts/deploy.sh [--region us-east-1] [--env prod]
#
# Prerequisites:
#   - AWS CLI configured with a profile that can write to S3 and trigger ASG refreshes
#   - jq, tar, npm installed locally
#   - terraform output available (or set DEPLOY_BUCKET and ASG_NAME env vars)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── Parse args ────────────────────────────────────────────────────────────────
REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-prod}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --env)    ENVIRONMENT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Read Terraform outputs (or override with env vars) ────────────────────────
TF_DIR="$ROOT_DIR/infra"

if [[ -z "${DEPLOY_BUCKET:-}" ]]; then
  DEPLOY_BUCKET="microsight-deploy-artifacts"
  echo "[deploy] Using default deploy bucket: $DEPLOY_BUCKET"
fi

if [[ -z "${ASG_NAME:-}" ]]; then
  echo "[deploy] Reading ASG name from Terraform outputs..."
  ASG_NAME=$(cd "$TF_DIR" && terraform output -raw asg_name 2>/dev/null || echo "")
  if [[ -z "$ASG_NAME" ]]; then
    echo "[deploy] ERROR: Could not determine ASG name. Set ASG_NAME env var or run terraform apply first."
    exit 1
  fi
fi

echo "[deploy] Region:      $REGION"
echo "[deploy] Environment: $ENVIRONMENT"
echo "[deploy] S3 bucket:   $DEPLOY_BUCKET"
echo "[deploy] ASG name:    $ASG_NAME"

# ── Build frontend ────────────────────────────────────────────────────────────
echo ""
echo "[deploy] Building frontend..."
cd "$ROOT_DIR"
npm ci
npm run build
echo "[deploy] Frontend built → dist/"

# ── Create deployment bundle ──────────────────────────────────────────────────
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BUNDLE_NAME="microsight-${ENVIRONMENT}-${TIMESTAMP}.tar.gz"
BUNDLE_PATH="/tmp/$BUNDLE_NAME"

echo "[deploy] Creating bundle: $BUNDLE_NAME"

# Bundle = server/ + dist/ + migrations/
tar -czf "$BUNDLE_PATH" \
  --transform "s|^|microsight/|" \
  -C "$ROOT_DIR" \
  server \
  dist \
  migrations

echo "[deploy] Bundle size: $(du -sh "$BUNDLE_PATH" | cut -f1)"

# ── Upload to S3 ──────────────────────────────────────────────────────────────
echo "[deploy] Uploading to s3://$DEPLOY_BUCKET/$BUNDLE_NAME ..."
aws s3 cp "$BUNDLE_PATH" "s3://$DEPLOY_BUCKET/$BUNDLE_NAME" \
  --region "$REGION" \
  --no-progress

# Update the latest.txt pointer
echo "$BUNDLE_NAME" | aws s3 cp - "s3://$DEPLOY_BUCKET/latest.txt" \
  --region "$REGION" \
  --content-type "text/plain"

echo "[deploy] Upload complete."

# ── Trigger ASG instance refresh ─────────────────────────────────────────────
echo "[deploy] Starting ASG instance refresh for $ASG_NAME ..."
REFRESH_ID=$(aws autoscaling start-instance-refresh \
  --auto-scaling-group-name "$ASG_NAME" \
  --strategy Rolling \
  --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":120}' \
  --region "$REGION" \
  --query InstanceRefreshId \
  --output text)

echo "[deploy] Instance refresh started: $REFRESH_ID"
echo "[deploy] Monitor progress:"
echo "  aws autoscaling describe-instance-refreshes \\"
echo "    --auto-scaling-group-name $ASG_NAME \\"
echo "    --instance-refresh-ids $REFRESH_ID \\"
echo "    --region $REGION"
echo ""
echo "[deploy] Done. Rolling deployment in progress."
