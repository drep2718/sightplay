'use strict';

/**
 * Global error handler — must be registered last in app.js.
 * Hides internal error details in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;

  // 500s are real problems; 4xx are expected (don't fill logs with 401 noise)
  if (statusCode >= 500) console.error('[ErrorHandler]', err);
  else if (statusCode !== 401) console.warn('[ErrorHandler]', err.message);

  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(statusCode).json({ error: message });
}

module.exports = { errorHandler };
