variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (prod, staging)"
  type        = string
  default     = "prod"
}

# ── Networking ──────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

# ── Domain & TLS ────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Root domain name (e.g. microsight.app) — must exist in Route 53"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for the domain"
  type        = string
}

# ── EC2 / ASG ───────────────────────────────────────────────────────────────

variable "ec2_instance_type" {
  description = "EC2 instance type for the API servers"
  type        = string
  default     = "t3.small"
}

variable "asg_min_size" {
  description = "Minimum number of EC2 instances in the ASG"
  type        = number
  default     = 2
}

variable "asg_max_size" {
  description = "Maximum number of EC2 instances in the ASG"
  type        = number
  default     = 6
}

variable "asg_desired_capacity" {
  description = "Desired number of EC2 instances in the ASG"
  type        = number
  default     = 2
}

variable "app_port" {
  description = "Port the Node.js app listens on"
  type        = number
  default     = 3001
}

variable "deploy_bucket" {
  description = "S3 bucket name that holds deployment artifacts"
  type        = string
  default     = "microsight-deploy-artifacts"
}

# ── RDS ─────────────────────────────────────────────────────────────────────

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "microsight"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "microsight_admin"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL master password (min 16 chars). Store in terraform.tfvars, never commit."
  type        = string
  sensitive   = true
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated RDS backups"
  type        = number
  default     = 7
}

# ── ElastiCache ─────────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis nodes in the replication group"
  type        = number
  default     = 2
}

# ── Application secrets ─────────────────────────────────────────────────────

variable "jwt_access_secret" {
  description = "Secret for signing access JWTs (min 32 random chars)"
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "Secret for signing refresh JWTs (min 32 random chars)"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
}
