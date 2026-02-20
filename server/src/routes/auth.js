'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/authController');

const router = Router();
const limiter = authLimiter();

// POST /api/auth/register
router.post('/register',
  limiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be 8–72 characters'),
  body('displayName').optional().trim().escape().isLength({ max: 50 }),
  validate,
  ctrl.register
);

// POST /api/auth/login
router.post('/login',
  limiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  ctrl.login
);

// POST /api/auth/refresh
router.post('/refresh', ctrl.refresh);

// POST /api/auth/logout
router.post('/logout', ctrl.logout);

// GET /api/auth/google
router.get('/google', ctrl.googleRedirect);

// GET /api/auth/google/callback
router.get('/google/callback', ctrl.googleCallback);

// GET /api/auth/me
router.get('/me', authenticate, ctrl.me);

module.exports = router;
