'use strict';

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
const morgan  = require('morgan');

const { getConfig } = require('./config/index');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes     = require('./routes/auth');
const usersRoutes    = require('./routes/users');
const statsRoutes    = require('./routes/stats');
const sessionsRoutes = require('./routes/sessions');
const adminRoutes    = require('./routes/admin');
const piecesRoutes   = require('./routes/pieces');

function createApp() {
  const app = express();

  // Trust the ALB's X-Forwarded-For header for real client IPs
  app.set('trust proxy', 1);

  // ── Security headers ───────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],   // Vite inlines critical CSS
        fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:         ["'self'", 'data:'],
        connectSrc:     ["'self'"],
        mediaSrc:       ["'self'"],
        objectSrc:      ["'none'"],
        frameSrc:       ["'self'"],                     // for PDF embed
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    // Prevent MIME-type sniffing
    noSniff: true,
    // Disable X-Powered-By
    hidePoweredBy: true,
    // Clickjacking protection
    frameguard: { action: 'deny' },
    // XSS protection header (legacy browsers)
    xssFilter: true,
  }));

  // ── CORS ────────────────────────────────────────────────────
  const { frontendUrl } = getConfig();
  app.use(cors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── Body parsing ────────────────────────────────────────────
  // Skip 10 KB limit for /api/pieces (handled per-route with 2 MB limit)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/pieces')) return next();
    express.json({ limit: '10kb' })(req, res, next);
  });
  app.use(cookieParser());

  // ── Logging ─────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  // ── General rate limiter (before routes) ────────────────────
  app.use(generalLimiter());

  // ── Health check (no auth, used by ALB target group) ────────
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // ── Routes ──────────────────────────────────────────────────
  app.use('/api/auth',     authRoutes);
  app.use('/api/users',    usersRoutes);
  app.use('/api/stats',    statsRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/admin',    adminRoutes);
  // Pieces need a larger body limit (file_content can be up to ~1.5 MB)
  app.use('/api/pieces',   express.json({ limit: '2mb' }), piecesRoutes);

  // ── Serve the Vite-built SPA in production ──────────────────
  // The dist/ folder lives one level above server/ in the bundle.
  const distPath = path.resolve(__dirname, '../../dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
      maxAge: '1y',        // Immutable hashed assets
      immutable: true,
      index: false,        // We handle the root ourselves
    }));

    // SPA fallback — all non-API routes serve index.html
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Development / API-only mode: plain 404 for unknown routes
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  }

  // ── Global error handler (must be last) ─────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
