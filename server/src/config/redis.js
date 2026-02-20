'use strict';

const Redis = require('ioredis');
const { getConfig } = require('./index');

let _client = null;

function getRedis() {
  if (!_client) {
    const { redis } = getConfig();
    _client = new Redis({
      host:                 redis.host,
      port:                 redis.port,
      password:             redis.password,
      maxRetriesPerRequest: 3,
      enableReadyCheck:     true,
    });
    _client.on('error', (err) => {
      console.error('Redis error:', err.message);
    });
  }
  return _client;
}

module.exports = { getRedis };
