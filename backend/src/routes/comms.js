/**
 * 📞 Reading the call and message history.
 *
 * 🔒 Private to the platform owner — services.is_private keeps it out of every
 * catalogue, gate('comms') keeps the data behind it, and every query is scoped
 * to the vendor on the token regardless.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { pollComms } from '../lib/commsPoll.js';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);

/** The other party — whichever end is not us. */
function counterparty(e) {
  return e.direction === 'incoming' ? e.from_number : e.to_number;
}

/**
 * GET /api/comms?since=<iso> → the timeline.
 *
 * `since` is what makes the page live: it asks only for what arrived after the
 * newest thing it already holds, so a poll every few seconds costs almost
 * nothing and the list grows rather than being redrawn.
 */
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const kind = ['call', 'message'].includes(req.query.kind) ? req.query.kind : null;
    const q = String(req.query.q || '').trim();

    const events = await prisma.comms_events.findMany({
      where: {
        vendor_id: v,                                        // 🔒 tenancy
        ...(since && !isNaN(since) ? { occurred_at: { gt: since } } : {}),
        ...(kind ? { kind } : {}),
        ...(q ? { OR: [
          { from_number: { contains: q } },
          { to_number: { contains: q } },
          { contact_name: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { occurred_at: 'desc' },
      take: since ? 100 : 200,
    });

    /* Grouped by the person on the other end, because that is how anybody
       thinks about it — "what did I say to this couple", not "what happened at
       4pm". Only on a full load; an incremental one returns the raw events so
       the page can merge them into what it already has. */
    let threads = null;
    if (!since) {
      const byParty = new Map();
      for (const e of events) {
        const key = counterparty(e) || 'unknown';
        if (!byParty.has(key)) byParty.set(key, { party: key, name: e.contact_name, count: 0, last: e.occurred_at, kinds: new Set() });
        const t = byParty.get(key);
        t.count++; t.kinds.add(e.kind);
        if (e.contact_name && !t.name) t.name = e.contact_name;
      }
      threads = [...byParty.values()]
        .map(t => ({ ...t, kinds: [...t.kinds] }))
        .sort((a, b) => new Date(b.last) - new Date(a.last))
        .slice(0, 40);
    }

    res.json({ events, threads, now: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/comms/sync → fetch from Quo right now.
 *
 * The poller runs every minute anyway, so this is for the moment somebody
 * wants to be certain rather than patient — and it reports what it found,
 * because a sync button that says nothing is the one Raj ends up pressing
 * repeatedly.
 */
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const r = await pollComms();
    if (r.skipped) return res.status(400).json({ error: 'Quo is not configured yet.' });
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true, added: r.added || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
