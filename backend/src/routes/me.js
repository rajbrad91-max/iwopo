import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { getFeatures } from '../lib/entitlements.js';

const router = express.Router();

// GET /api/me/features → feature keys this vendor has (super_admin gets '*')
router.get('/features', requireAuth, async (req, res) => {
  if (req.user.role === 'super_admin') return res.json({ features: ['*'] });
  if (!req.user.vendor_id) return res.json({ features: [] });
  try {
    const set = await getFeatures(req.user.vendor_id);
    res.json({ features: [...set] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/me/settings
router.get('/settings', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  if (!vid) return res.json({ settings: null });
  try {
    let { rows } = await query('SELECT * FROM vendor_settings WHERE vendor_id=$1', [vid]);
    if (!rows[0]) {
      await query('INSERT INTO vendor_settings (vendor_id) VALUES ($1)', [vid]);
      rows = (await query('SELECT * FROM vendor_settings WHERE vendor_id=$1', [vid])).rows;
    }
    res.json({ settings: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/me/settings
router.put('/settings', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  if (!vid) return res.status(400).json({ error: 'No vendor' });
  const { time_format, timezone, theme } = req.body;
  try {
    await query(
      `INSERT INTO vendor_settings (vendor_id, time_format, timezone, theme)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (vendor_id) DO UPDATE SET time_format=$2, timezone=$3, theme=$4, updated_at=NOW()`,
      [vid, time_format || '12h', timezone || 'America/Vancouver', theme || 'dark']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/me/email
router.put('/email', requireAuth, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email + current password required' });
  try {
    const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong password' });
    const dupe = await query('SELECT id FROM users WHERE email=$1 AND id<>$2', [email, req.user.id]);
    if (dupe.rows.length) return res.status(409).json({ error: 'Email already in use' });
    await query('UPDATE users SET email=$1 WHERE id=$2', [email, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/me/password
router.put('/password', requireAuth, async (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ error: 'Both passwords required' });
  if (next.length < 6) return res.status(400).json({ error: 'New password too short (min 6)' });
  try {
    const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const ok = await bcrypt.compare(current, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong current password' });
    const hash = await bcrypt.hash(next, 10);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
