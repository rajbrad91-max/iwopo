import express from 'express';
import { query } from '../config/db.js';

const router = express.Router();

// ── EDIT YOUR POLL HERE ──────────────────────────────
const POLL_TITLE = 'Which name do you like best?';
const OPTIONS = ['Name A', 'Name B', 'Name C', 'Name D'];
const RESULTS_PASSWORD = 'xyz.123';
// ─────────────────────────────────────────────────────

function clientIp(req) {
  // trust proxy is on → req.ip is the real client IP behind nginx
  return (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString().split(',')[0].trim();
}

// 🗳️ poll config + whether THIS ip already voted (and for what)
router.get('/', async (req, res) => {
  try {
    const ip = clientIp(req);
    const { rows } = await query('SELECT choice FROM poll_votes WHERE ip=$1', [ip]);
    res.json({ title: POLL_TITLE, options: OPTIONS, myVote: rows[0]?.choice || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🗳️ cast a vote — one per IP, enforced by unique index
router.post('/', async (req, res) => {
  try {
    const ip = clientIp(req);
    const choice = (req.body.choice || '').toString();
    if (!OPTIONS.includes(choice)) return res.status(400).json({ error: 'Invalid choice' });

    const existing = await query('SELECT choice FROM poll_votes WHERE ip=$1', [ip]);
    if (existing.rows[0]) return res.status(409).json({ error: 'Already voted', myVote: existing.rows[0].choice });

    await query('INSERT INTO poll_votes (choice, ip) VALUES ($1,$2) ON CONFLICT (ip) DO NOTHING', [choice, ip]);
    res.json({ ok: true, myVote: choice });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📊 password-gated results
router.post('/results', async (req, res) => {
  try {
    if ((req.body.password || '') !== RESULTS_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const { rows } = await query('SELECT choice, COUNT(*)::int AS n FROM poll_votes GROUP BY choice', []);
    const counts = {};
    for (const o of OPTIONS) counts[o] = 0;
    for (const r of rows) if (counts[r.choice] !== undefined) counts[r.choice] = r.n;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    res.json({ counts, total, options: OPTIONS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
