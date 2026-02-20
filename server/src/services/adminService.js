'use strict';

const { query } = require('../config/database');

async function listUsers({ page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.role, u.auth_provider,
            u.is_active, u.created_at,
            s.total_attempts, s.total_correct
     FROM users u
     LEFT JOIN all_time_stats s ON s.user_id = u.id
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const { rows: countRows } = await query('SELECT COUNT(*) FROM users');

  return { users: rows, total: parseInt(countRows[0].count, 10), page, limit };
}

async function changeUserRole(targetId, newRole) {
  const { rowCount } = await query(
    'UPDATE users SET role = $2 WHERE id = $1 AND is_active = TRUE',
    [targetId, newRole]
  );
  if (!rowCount) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
}

async function deleteUser(targetId) {
  const { rowCount } = await query(
    'UPDATE users SET is_active = FALSE WHERE id = $1',
    [targetId]
  );
  if (!rowCount) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
}

async function getPlatformStats() {
  const [usersResult, statsResult, sessionsResult] = await Promise.all([
    query(`SELECT COUNT(*) AS total_users,
                  COUNT(*) FILTER (WHERE role = 'admin') AS admins,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_last_7d
           FROM users WHERE is_active = TRUE`),
    query(`SELECT SUM(total_attempts) AS total_attempts,
                  SUM(total_correct)  AS total_correct
           FROM all_time_stats`),
    query(`SELECT COUNT(*) AS total_sessions,
                  COUNT(*) FILTER (WHERE ended_at IS NOT NULL) AS completed_sessions
           FROM sessions`),
  ]);

  return {
    users:    usersResult.rows[0],
    stats:    statsResult.rows[0],
    sessions: sessionsResult.rows[0],
  };
}

module.exports = { listUsers, changeUserRole, deleteUser, getPlatformStats };
