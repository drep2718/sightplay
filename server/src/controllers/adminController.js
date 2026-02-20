'use strict';

const adminService = require('../services/adminService');

async function listUsers(req, res, next) {
  try {
    const page  = parseInt(req.query.page  || '1',  10);
    const limit = parseInt(req.query.limit || '50', 10);
    const result = await adminService.listUsers({ page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function changeRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(422).json({ error: 'Role must be "user" or "admin"' });
    }
    // Prevent self-demotion via this endpoint
    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(403).json({ error: 'Cannot demote yourself' });
    }
    await adminService.changeUserRole(req.params.id, role);
    res.json({ message: 'Role updated' });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    if (req.params.id === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete your own account via admin endpoint' });
    }
    await adminService.deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
}

async function platformStats(req, res, next) {
  try {
    const stats = await adminService.getPlatformStats();
    res.json({ stats });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, changeRole, deleteUser, platformStats };
