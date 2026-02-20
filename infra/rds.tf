# ── DB subnet group (private subnets only) ───────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.name}-db-subnet-group" }
}

# ── Parameter group — enforce SSL, tune for the workload ────────────────────

resource "aws_db_parameter_group" "postgres" {
  name   = "${local.name}-pg16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries slower than 1 s
  }

  tags = { Name = "${local.name}-pg16" }
}

# ── RDS PostgreSQL — Multi-AZ, automated backups, PITR ──────────────────────

resource "aws_db_instance" "main" {
  identifier = "${local.name}-postgres"

  engine               = "postgres"
  engine_version       = "16.3"
  instance_class       = var.db_instance_class
  allocated_storage    = 20
  max_allocated_storage = 100       # Autoscaling up to 100 GB
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  multi_az                     = true
  publicly_accessible          = false    # Never expose to internet
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final-snapshot"

  backup_retention_period = var.db_backup_retention_days
  backup_window           = "03:00-04:00"  # UTC
  maintenance_window      = "Mon:04:30-Mon:05:30"

  # Performance Insights (free tier: 7-day retention)
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # Monitoring — 60-second granularity
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  # Automatically apply minor version upgrades
  auto_minor_version_upgrade = true

  tags = { Name = "${local.name}-postgres" }
}

# ── IAM role for Enhanced Monitoring ─────────────────────────────────────────

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
