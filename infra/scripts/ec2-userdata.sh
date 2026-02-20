#!/bin/bash
# EC2 user-data — runs as root on first boot.
# Installs Node.js + pm2, pulls the latest app bundle from S3, and starts it.
# Templated by Terraform: ${aws_region}, ${aws_secret_id}, ${deploy_bucket},
#                         ${app_port}, ${node_env}

set -euo pipefail

# ── Log everything to /var/log/userdata.log ──────────────────────────────────
exec > >(tee /var/log/userdata.log | logger -t userdata) 2>&1
echo "[userdata] Starting at $(date -u)"

# ── System packages ───────────────────────────────────────────────────────────
dnf update -y
dnf install -y tar gzip aws-cli

# ── Node.js 20.x (via NodeSource) ────────────────────────────────────────────
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node --version
npm --version

# ── pm2 for process management ────────────────────────────────────────────────
npm install -g pm2
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# ── Create app directory ──────────────────────────────────────────────────────
APP_DIR=/opt/microsight
mkdir -p "$APP_DIR"
chown ec2-user:ec2-user "$APP_DIR"

# ── Pull the latest deployment bundle from S3 ────────────────────────────────
BUNDLE_KEY=$(aws s3 cp s3://${deploy_bucket}/latest.txt - 2>/dev/null || echo "app.tar.gz")
echo "[userdata] Downloading bundle: $BUNDLE_KEY"
aws s3 cp "s3://${deploy_bucket}/$BUNDLE_KEY" /tmp/app.tar.gz

tar -xzf /tmp/app.tar.gz -C "$APP_DIR" --strip-components=1
chown -R ec2-user:ec2-user "$APP_DIR"

# ── Install server dependencies ───────────────────────────────────────────────
cd "$APP_DIR/server"
npm ci --omit=dev

# ── Write environment config ──────────────────────────────────────────────────
cat > "$APP_DIR/server/.env.runtime" <<EOF
NODE_ENV=${node_env}
PORT=${app_port}
AWS_REGION=${aws_region}
AWS_SECRET_ID=${aws_secret_id}
EOF
chown ec2-user:ec2-user "$APP_DIR/server/.env.runtime"

# ── Run DB migrations (only on first boot, idempotent SQL) ───────────────────
# Export env so psql can read them via Secrets Manager
SECRETS=$(aws secretsmanager get-secret-value \
  --secret-id "${aws_secret_id}" \
  --region "${aws_region}" \
  --query SecretString \
  --output text)

DB_HOST=$(echo "$SECRETS" | python3 -c "import sys,json; print(json.load(sys.stdin)['DB_HOST'])")
DB_PORT=$(echo "$SECRETS" | python3 -c "import sys,json; print(json.load(sys.stdin)['DB_PORT'])")
DB_NAME=$(echo "$SECRETS" | python3 -c "import sys,json; print(json.load(sys.stdin)['DB_NAME'])")
DB_USER=$(echo "$SECRETS" | python3 -c "import sys,json; print(json.load(sys.stdin)['DB_USER'])")
DB_PASS=$(echo "$SECRETS" | python3 -c "import sys,json; print(json.load(sys.stdin)['DB_PASSWORD'])")

export PGPASSWORD="$DB_PASS"

# Run migrations — psql is idempotent with CREATE IF NOT EXISTS / extensions
for f in "$APP_DIR/migrations"/*.sql; do
  echo "[userdata] Running migration: $(basename $f)"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$f" || true
done

unset PGPASSWORD

# ── Start the app under ec2-user via pm2 ────────────────────────────────────
su -c "
  source /home/ec2-user/.bash_profile 2>/dev/null || true
  cd $APP_DIR/server
  set -a
  source .env.runtime
  set +a
  pm2 delete microsight-api 2>/dev/null || true
  pm2 start src/server.js \
    --name microsight-api \
    --instances max \
    --exec-mode cluster \
    --max-memory-restart 400M \
    --log /var/log/microsight/app.log \
    --merge-logs
  pm2 save
" ec2-user

echo "[userdata] Done at $(date -u)"
