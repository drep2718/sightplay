'use strict';

const { Pool } = require('pg');
const { getConfig } = require('./index');

let _pool = null;

function getPool() {
  if (!_pool) {
    const { db } = getConfig();
    _pool = new Pool({
      host:     db.host,
      port:     db.port,
      database: db.database,
      user:     db.user,
      password: db.password,
      max:      10,
      idleTimeoutMillis:    30000,
      connectionTimeoutMillis: 5000,
    });
    _pool.on('error', (err) => {
      console.error('Idle PG client error:', err.message);
    });
  }
  return _pool;
}

/**
 * Run a parameterized query.
 * @param {string} text   SQL with $1, $2, … placeholders
 * @param {any[]}  params Bound values
 */
async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}

/**
 * Run multiple queries in a single transaction.
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, withTransaction, getPool };
