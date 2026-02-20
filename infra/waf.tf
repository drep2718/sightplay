# ── WAF WebACL — AWS managed rule sets on the ALB ───────────────────────────
# Blocks common threats (OWASP Top 10 patterns, known bad IPs, SQL injection)
# without writing custom rules.

resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name}-waf"
  description = "MicroSight WAF — managed rule groups"
  scope       = "REGIONAL"  # ALB requires REGIONAL; CloudFront uses CLOUDFRONT

  default_action {
    allow {}
  }

  # ── AWS Core Rule Set (CRS) — OWASP Top 10 ──────────────────────────────

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # ── Known bad inputs ────────────────────────────────────────────────────

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  # ── SQL injection ────────────────────────────────────────────────────────

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 30

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLiRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # ── Amazon IP Reputation List (known bad IPs) ────────────────────────────

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 5

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AmazonIpReputationList"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${local.name}-waf" }
}

# ── Associate WAF with the ALB ───────────────────────────────────────────────

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

# ── CloudWatch log group for WAF sampled requests ────────────────────────────

resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-${local.name}"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.main.arn
}
