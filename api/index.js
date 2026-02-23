'use strict';

/**
 * Vercel serverless function entry point.
 * Wraps the Express app so all /api/* requests are handled by the same
 * Express logic as the local dev server.
 */

// Load server/.env when running locally via `vercel dev` (dotenv is a server dep)
try {
  require('../server/node_modules/dotenv').config({
    path: require('path').resolve(__dirname, '../server/.env'),
  });
} catch { /* not available in production — env vars come from Vercel dashboard */ }

const { createApp } = require('../server/src/app');
const app = createApp();

module.exports = app;
