output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "app_url" {
  description = "Live application URL"
  value       = "https://${var.domain_name}"
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (private — accessible only from EC2)"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint (private)"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "secrets_manager_secret_name" {
  description = "Name of the Secrets Manager secret holding all app secrets"
  value       = aws_secretsmanager_secret.app.name
}

output "asg_name" {
  description = "Auto Scaling Group name (used by deploy.sh for instance refresh)"
  value       = aws_autoscaling_group.app.name
}

output "ec2_iam_role_arn" {
  description = "IAM role ARN attached to EC2 instances"
  value       = aws_iam_role.ec2.arn
}
