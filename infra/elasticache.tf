# ── ElastiCache subnet group (private subnets only) ─────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.name}-redis-subnet-group" }
}

# ── Redis parameter group — enable keyspace notifications (optional) ─────────

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${local.name}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"   # Evict LRU keys when memory full
  }

  tags = { Name = "${local.name}-redis7" }
}

# ── Redis Replication Group — Multi-AZ, automatic failover ──────────────────

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name}-redis"
  description          = "MicroSight rate-limit & OAuth state cache"

  node_type            = var.redis_node_type
  port                 = 6379
  num_cache_clusters   = var.redis_num_cache_nodes

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  automatic_failover_enabled  = true
  multi_az_enabled            = true

  # Maintenance & snapshots
  snapshot_retention_limit = 3
  snapshot_window          = "02:00-03:00"
  maintenance_window       = "sun:05:00-sun:06:00"

  # Keep Redis version current with minor updates
  auto_minor_version_upgrade = true
  engine_version             = "7.1"

  tags = { Name = "${local.name}-redis" }
}
