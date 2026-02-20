'use strict';

const { query } = require('../config/database');

/**
 * Must run AFTER authenticate middleware.
 * Re-fetches the user's role from the DB (bypasses JWT cache window)
 * so a recently-demoted admin cannot still access admin routes.
 */
async function requireAdmin(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT role FROM users WHERE id = $1 AND is_active = TRUE',
      [req.user.id]
    );
    if (!rows.length || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAdmin };
