-- ─────────────────────────────────────────────────────────────
-- Seed: promote a user to admin
-- Replace 'your@email.com' with the actual admin email address.
-- Run AFTER the user registers via the app.
-- ─────────────────────────────────────────────────────────────

UPDATE users
SET role = 'admin'
WHERE email = 'your@email.com';
