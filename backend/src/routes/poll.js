import express from 'express';
import prisma from '../config/prisma.js';

const router = express.Router();

// ── EDIT YOUR POLL HERE ──────────────────────────────
const POLL_TITLE = 'Which brand name do you like best?';
const OPTIONS = ['Vendlio.ai', 'iwopo.com', 'iwopo.com'];
const HINTS = {
  'Vendlio.ai': 'Relatable (vendors)',
  'iwopo.com': 'Unique (no built-in meaning)',
  'iwopo.com': 'Relatable, but easy to misspell',
};
const RESULTS_PASSWORD = 'xyz.123';
// ─────────────────────────────────────────────────────

function clientIp(req) {
  // trust proxy is on → req.ip is the real client IP behind nginx
  return (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString().split(',')[0].trim();
}

// 🗳️ poll config + whether THIS ip already voted (and for what)
router.get('/', async (req, res) => {
  try {
    const vote = await prisma.poll_votes.findFirst({
      where: { ip: clientIp(req) },
      select: { choice: true },
    });
    res.json({ title: POLL_TITLE, options: OPTIONS, hints: HINTS, myVote: vote?.choice || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🗳️ cast a vote — one per IP, enforced by unique index
router.post('/', async (req, res) => {
  try {
    const ip = clientIp(req);
    const choice = (req.body.choice || '').toString();
    if (!OPTIONS.includes(choice)) return res.status(400).json({ error: 'Invalid choice' });

    const existing = await prisma.poll_votes.findFirst({ where: { ip }, select: { choice: true } });
    if (existing) return res.status(409).json({ error: 'Already voted', myVote: existing.choice });

    // the unique index on ip is the real guard against double votes
    try {
      await prisma.poll_votes.create({ data: { choice, ip } });
    } catch { /* ON CONFLICT (ip) DO NOTHING — a racing vote already landed */ }
    res.json({ ok: true, myVote: choice });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📊 password-gated results
router.post('/results', async (req, res) => {
  try {
    if ((req.body.password || '') !== RESULTS_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const grouped = await prisma.poll_votes.groupBy({ by: ['choice'], _count: { _all: true } });
    const counts = {};
    for (const o of OPTIONS) counts[o] = 0;
    for (const r of grouped) if (counts[r.choice] !== undefined) counts[r.choice] = r._count._all;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    res.json({ counts, total, options: OPTIONS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
