'use strict';

const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/index');

/**
 * Verify the Bearer access token in the Authorization header.
 * On success, attaches `req.user = { id, role }` and calls next().
 * On failure, responds 401.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  const { jwt: jwtConfig } = getConfig();

  try {
    const payload = jwt.verify(token, jwtConfig.accessSecret, {
      issuer: 'microsight-api',
    });
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticate };
