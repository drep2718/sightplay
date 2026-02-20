'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const ctrl = require('../controllers/adminController');

const router = Router();

// All admin routes require authentication + admin role
// requireAdmin re-fetches role from DB to bypass JWT cache window
router.use(authenticate, requireAdmin);

// GET  /api/admin/users
router.get('/users', ctrl.listUsers);

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', ctrl.changeRole);

// DELETE /api/admin/users/:id
router.delete('/users/:id', ctrl.deleteUser);

// GET /api/admin/stats
router.get('/stats', ctrl.platformStats);

module.exports = router;
