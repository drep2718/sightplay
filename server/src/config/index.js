'use strict';

/**
 * Load configuration from environment variables.
 * Works identically in development (server/.env) and production (docker-compose env).
 * Cached after first call.
 */

let _config = null;

function loadConfig() {
  if (_config) return _config;

  _config = {
    db: {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME     || 'microsight',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    },
    redis: {
      host:     process.env.REDIS_HOST || 'localhost',
      port:     parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    jwt: {
      accessSecret:  requireEnv('JWT_ACCESS_SECRET'),
      refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    },
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID     || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl:  process.env.GOOGLE_CALLBACK_URL  || 'http://localhost:3001/api/auth/google/callback',
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    port:        parseInt(process.env.PORT || '3001', 10),
  };

  return _config;
}

function getConfig() {
  if (!_config) loadConfig();
  return _config;
}

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Required environment variable ${key} is not set`);
  return val;
}

module.exports = { loadConfig, getConfig };
