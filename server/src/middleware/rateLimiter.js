'use strict';

const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedis } = require('../config/redis');

/**
 * Strict limiter for auth endpoints — 10 requests per 15 minutes per IP.
 * Shared across all EC2 instances via Redis.
 */
function authLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    store: new RedisStore({
      sendCommand: (...args) => getRedis().call(...args),
      prefix: 'rl:auth:',
    }),
  });
}

/**
 * General limiter — 100 requests per minute per IP for all other routes.
 */
function generalLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    store: new RedisStore({
      sendCommand: (...args) => getRedis().call(...args),
      prefix: 'rl:general:',
    }),
  });
}

module.exports = { authLimiter, generalLimiter };
