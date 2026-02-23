'use strict';

/**
 * Demo mode middleware — activated by DEMO_MODE=true env var.
 *
 * When active this middleware:
 *  1. Lets /api/auth/* pass through (handled by demoAuth in authController)
 *  2. Short-circuits all other /api/* routes with realistic empty stubs
 *     so the frontend works without a database or Redis.
 */

const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Default preferences returned for demo user
const DEFAULT_PREFS = {
  mode: 'flash', clef: 'treble', tier: 1, accidentals: false,
  show_keyboard: true, kb_size: 'auto', bpm: 80,
  time_sig: '4/4', interval_max: 8,
};

function demoStubs(req, res, next) {
  if (!DEMO_MODE) return next();

  const { method, path } = req;

  // Auth routes handled separately — let them through
  if (path.startsWith('/api/auth')) return next();

  // ── Users ─────────────────────────────────────────────────────
  if (method === 'GET'  && path === '/api/users/preferences')
    return res.json({ preferences: DEFAULT_PREFS });
  if (method === 'PUT'  && path === '/api/users/preferences')
    return res.json({ preferences: DEFAULT_PREFS });
  if (method === 'DELETE' && path === '/api/users/account')
    return res.json({ message: 'Demo account cannot be deleted' });

  // ── Stats ──────────────────────────────────────────────────────
  if (method === 'GET'   && path === '/api/stats')
    return res.json({ stats: { total_attempts: 0, total_correct: 0, best_reaction: null, reaction_times: [] } });
  if (method === 'PATCH' && path === '/api/stats/attempt')
    return res.json({ ok: true });
  if (method === 'PUT'   && path === '/api/stats')
    return res.json({ ok: true });

  // ── Sessions ───────────────────────────────────────────────────
  if (method === 'GET'  && path.startsWith('/api/sessions') && !path.match(/\/[^/]+\/end$/))
    return res.json({ sessions: [], total: 0 });
  if (method === 'POST' && path === '/api/sessions')
    return res.status(201).json({ session: { id: `demo-${Date.now()}` } });
  if (method === 'POST' && path.match(/^\/api\/sessions\/.+\/end$/))
    return res.json({ message: 'ok' });

  // ── Pieces ─────────────────────────────────────────────────────
  if (method === 'GET'   && path === '/api/pieces')
    return res.json({ pieces: [] });
  if (method === 'POST'  && path === '/api/pieces')
    return res.status(201).json({ piece: { id: `demo-${Date.now()}`, title: req.body?.title || 'Demo', file_type: req.body?.file_type || 'xml', is_favorite: false, play_count: 0 } });
  if (method === 'GET'   && path.match(/^\/api\/pieces\/[^/]+$/))
    return res.status(404).json({ error: 'Demo mode — pieces are not persisted' });
  if (method === 'PATCH' && path.match(/^\/api\/pieces\/.+\/favorite$/))
    return res.json({ id: 'demo', is_favorite: true });
  if (method === 'PATCH' && path.match(/^\/api\/pieces\/.+\/played$/))
    return res.json({ id: 'demo', play_count: 1, last_played_at: new Date() });
  if (method === 'DELETE' && path.match(/^\/api\/pieces\/[^/]+$/))
    return res.json({ message: 'Piece deleted' });

  // ── Admin ──────────────────────────────────────────────────────
  if (path.startsWith('/api/admin'))
    return res.status(403).json({ error: 'Admin unavailable in demo mode' });

  // Unknown route — fall through to normal handler
  next();
}

module.exports = { demoStubs, DEMO_MODE };
