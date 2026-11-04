import express from 'express';
import prisma from '../config/prisma.js';
import { clientIp } from '../lib/clientIp.js';
import { serverError } from '../lib/httpError.js';
import { limit } from '../middleware/rateLimit.js';

const router = express.Router();

// ── EDIT YOUR POLL HERE ──────────────────────────────
// The name vote is settled — iwopo won — so this is kept only for the vote
// history already recorded against it. The options were left holding two
// identical 'iwopo.com' entries after a rename, which meant the second hint
// silently replaced the first.
const POLL_TITLE = 'Which brand name do you like best?';
const OPTIONS = ['Vendlio.ai', 'iwopo.com'];
const HINTS = {
  'Vendlio.ai': 'Relatable (vendors)',
  'iwopo.com': 'Unique (no built-in meaning)',
};
const RESULTS_PASSWORD = 'xyz.123';
// ─────────────────────────────────────────────────────


// 🗳️ poll config + whether THIS ip already voted (and for what)
router.get('/', async (req, res) => {
  try {
    const vote = await prisma.poll_votes.findFirst({
      where: { ip: clientIp(req) },
      select: { choice: true },
    });
    res.json({ title: POLL_TITLE, options: OPTIONS, hints: HINTS, myVote: vote?.choice || null });
  } catch (e) { serverError(res, e); }
});

// 🗳️ cast a vote — one per IP, enforced by unique index
router.post('/', limit({ name: 'poll-vote', max: 30, windowMs: 60 * 60_000 }), async (req, res) => {
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
  } catch (e) { serverError(res, e); }
});

// 📊 password-gated results
router.post('/results', limit({ name: 'poll-results', max: 30, windowMs: 60 * 60_000 }), async (req, res) => {
  try {
    if ((req.body.password || '') !== RESULTS_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
    const grouped = await prisma.poll_votes.groupBy({ by: ['choice'], _count: { _all: true } });
    const counts = {};
    for (const o of OPTIONS) counts[o] = 0;
    for (const r of grouped) if (counts[r.choice] !== undefined) counts[r.choice] = r._count._all;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    res.json({ counts, total, options: OPTIONS });
  } catch (e) { serverError(res, e); }
});

export default router;
