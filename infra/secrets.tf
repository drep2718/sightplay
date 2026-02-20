# ── AWS Secrets Manager — all runtime secrets in one secret ─────────────────
# EC2 instances fetch this at startup via the SDK.
# Rotation of DB credentials can be automated via a Lambda rotator
# (not wired here — add when needed).

resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name}/app-secrets"
  description = "MicroSight application runtime secrets"

  # Prevent accidental deletion of the secret
  recovery_window_in_days = 7

  tags = { Name = "${local.name}-app-secrets" }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    # Database
    DB_HOST     = aws_db_instance.main.address
    DB_PORT     = tostring(aws_db_instance.main.port)
    DB_NAME     = var.db_name
    DB_USER     = var.db_username
    DB_PASSWORD = var.db_password

    # Redis — use the primary endpoint of the replication group
    REDIS_HOST     = aws_elasticache_replication_group.main.primary_endpoint_address
    REDIS_PORT     = "6379"

    # JWT
    JWT_ACCESS_SECRET  = var.jwt_access_secret
    JWT_REFRESH_SECRET = var.jwt_refresh_secret

    # Google OAuth
    GOOGLE_CLIENT_ID     = var.google_client_id
    GOOGLE_CLIENT_SECRET = var.google_client_secret
    GOOGLE_CALLBACK_URL  = "https://${var.domain_name}/api/auth/google/callback"

    # App
    FRONTEND_URL = "https://${var.domain_name}"
    PORT         = tostring(var.app_port)
  })

  # Recreate the version any time secrets change
  lifecycle {
    ignore_changes = [
      # Prevent drift if manual rotation updates the version outside Terraform
      secret_string,
    ]
  }
}

# ── IAM policy allowing EC2 to read this secret only ────────────────────────

data "aws_iam_policy_document" "secrets_read" {
  statement {
    sid    = "ReadAppSecret"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

resource "aws_iam_policy" "secrets_read" {
  name        = "${local.name}-secrets-read"
  description = "Allow reading the MicroSight app secret"
  policy      = data.aws_iam_policy_document.secrets_read.json
}
