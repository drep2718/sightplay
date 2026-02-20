# ── IAM role for EC2 instances ───────────────────────────────────────────────

resource "aws_iam_role" "ec2" {
  name = "${local.name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# SSM Session Manager — zero-trust shell access (no SSH, no exposed port 22)
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# S3 read access for deployment artifacts
data "aws_iam_policy_document" "ec2_s3" {
  statement {
    sid     = "ReadDeployArtifacts"
    effect  = "Allow"
    actions = ["s3:GetObject", "s3:ListBucket"]
    resources = [
      "arn:aws:s3:::${var.deploy_bucket}",
      "arn:aws:s3:::${var.deploy_bucket}/*",
    ]
  }
}

resource "aws_iam_policy" "ec2_s3" {
  name   = "${local.name}-ec2-s3"
  policy = data.aws_iam_policy_document.ec2_s3.json
}

resource "aws_iam_role_policy_attachment" "ec2_s3" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.ec2_s3.arn
}

# Secrets Manager — read the app secret
resource "aws_iam_role_policy_attachment" "ec2_secrets" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.secrets_read.arn
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ── Launch template ───────────────────────────────────────────────────────────

resource "aws_launch_template" "app" {
  name_prefix   = "${local.name}-lt-"
  image_id      = data.aws_ami.al2023.id
  instance_type = var.ec2_instance_type

  iam_instance_profile { arn = aws_iam_instance_profile.ec2.arn }

  network_interfaces {
    associate_public_ip_address = false          # Private subnet only
    security_groups             = [aws_security_group.ec2.id]
    delete_on_termination       = true
  }

  # No key pair — use SSM Session Manager instead (no exposed port 22)

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"  # IMDSv2 only (prevents SSRF)
    http_put_response_hop_limit = 1
  }

  monitoring { enabled = true }   # Detailed CloudWatch metrics

  user_data = base64encode(templatefile("${path.module}/scripts/ec2-userdata.sh", {
    aws_region    = var.aws_region
    aws_secret_id = aws_secretsmanager_secret.app.name
    deploy_bucket = var.deploy_bucket
    app_port      = var.app_port
    node_env      = var.environment
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${local.name}-api"
    }
  }

  lifecycle { create_before_destroy = true }
}

# ── Auto Scaling Group ────────────────────────────────────────────────────────

resource "aws_autoscaling_group" "app" {
  name                = "${local.name}-asg"
  vpc_zone_identifier = aws_subnet.private[*].id
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB"
  health_check_grace_period = 120

  min_size         = var.asg_min_size
  max_size         = var.asg_max_size
  desired_capacity = var.asg_desired_capacity

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # Rolling replacement: replace 50% of instances at a time on updates
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 120
    }
  }

  # Spread instances across AZs
  availability_zones = local.azs

  tag {
    key                 = "Name"
    value               = "${local.name}-api"
    propagate_at_launch = true
  }

  lifecycle { create_before_destroy = true }
}

# ── Scale out: CPU > 60% for 2 consecutive minutes ───────────────────────────

resource "aws_autoscaling_policy" "scale_out" {
  name                   = "${local.name}-scale-out"
  autoscaling_group_name = aws_autoscaling_group.app.name
  adjustment_type        = "ChangeInCapacity"
  scaling_adjustment     = 1
  cooldown               = 120
}

resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "${local.name}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Average"
  threshold           = 60
  alarm_actions       = [aws_autoscaling_policy.scale_out.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }
}

# ── Scale in: CPU < 30% for 5 consecutive minutes ────────────────────────────

resource "aws_autoscaling_policy" "scale_in" {
  name                   = "${local.name}-scale-in"
  autoscaling_group_name = aws_autoscaling_group.app.name
  adjustment_type        = "ChangeInCapacity"
  scaling_adjustment     = -1
  cooldown               = 300
}

resource "aws_cloudwatch_metric_alarm" "low_cpu" {
  alarm_name          = "${local.name}-low-cpu"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 5
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Average"
  threshold           = 30
  alarm_actions       = [aws_autoscaling_policy.scale_in.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }
}
