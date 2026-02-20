'use strict';

// Load .env before anything reads process.env (dev only; prod uses real env vars)
require('dotenv').config();

const { loadConfig, getConfig } = require('./config/index');
const { getPool } = require('./config/database');
const { getRedis } = require('./config/redis');
const { createApp } = require('./app');

async function start() {
  // Load and validate configuration from environment variables
  loadConfig();
  const { port } = getConfig();

  // Verify DB connectivity
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('✓ PostgreSQL connected');

  // Verify Redis connectivity (ioredis auto-connects on first command)
  const redis = getRedis();
  await redis.ping();
  console.log('✓ Redis connected');

  const app = createApp();

  app.listen(port, () => {
    console.log(`✓ MicroSight API listening on port ${port} [${process.env.NODE_ENV || 'development'}]`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
