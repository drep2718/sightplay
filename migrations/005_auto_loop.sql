-- Migration 005: add auto_loop_range preference
-- Run manually: docker compose exec postgres psql -U postgres -d microsight -f /docker-entrypoint-initdb.d/005_auto_loop.sql

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS auto_loop_range BOOLEAN NOT NULL DEFAULT FALSE;
