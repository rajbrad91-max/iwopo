/**
 * 📞 Reading the call and message history.
 *
 * 🔒 Private to the platform owner — services.is_private keeps it out of every
 * catalogue, gate('comms') keeps the data behind it, and every query is scoped
 * to the vendor on the token regardless.
 */
import express from 'express';
import { Readable } from 'node:stream';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { pollComms } from '../lib/commsPoll.js';
import { quoConfig, getCallRecordings, ownNumbers, saveContact, sendMessage } from '../lib/quo.js';
import { contactsByNumber, forgetContacts } from '../lib/commsEnrich.js';
import { normalise, upsertEvent } from './commsWebhook.js';
import { limit } from '../middleware/rateLimit.js';
import { badgesFor, leadBadges, tenDigits } from '../lib/commsBadges.js';
import { commsBus } from '../lib/commsPop.js';
import { requestLead, answerBooking } from '../lib/callLeads.js';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);

/**
 * 📞 GET /api/comms/live — an open line from the server to the panel.
 *
 * Server-Sent Events: the panel keeps this request open and the server writes
 * a line the moment a call starts ringing (see lib/commsPop.js). The bell's
 * fifteen-second check is far too slow for a phone that rings for twenty.
 * 🔒 A panel hears only its own vendor, and only the vendor Quo is connected
 * to has anything to hear.
 */
router.get('/live', requireAuth, (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',            // nginx must pass each line on at once, not hold it in a buffer
  });
  res.write('retry: 3000\n\n');
  const send = (msg) => res.write(`event: pop\ndata: ${JSON.stringify(msg)}\n\n`);
  commsBus.on(`v${v}`, send);
  // a comment every 25 s keeps proxies from closing a quiet connection
  const beat = setInterval(() => res.write(': ok\n\n'), 25_000);
  req.on('close', () => { clearInterval(beat); commsBus.off(`v${v}`, send); });
});

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
    /* 📞 Only the line chosen in Super Admin. Switching from one number to the
       other used to leave the first number's messages on screen, because
       nothing recorded which line an event came from. "Every number" shows
       them all. */
    const cfg = await quoConfig();
    const line = cfg.phoneNumberId && cfg.vendorId === v ? cfg.phoneNumberId : null;

    const events = await prisma.comms_events.findMany({
      where: {
        vendor_id: v,                                        // 🔒 tenancy
        ...(line ? { line_id: line } : {}),
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
      take: since ? 100 : 500,
    });

    /* Grouping by person is done in the page, from these same events, so a
       call that arrives while somebody is watching joins its thread at once
       instead of waiting for a full reload. */
    res.json({ events, badges: await leadBadges(v, events), now: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/**
 * POST /api/comms/badges { numbers: [...] } → the badges for numbers already
 * on screen. The open page asks every half minute, so a lead created or
 * marked booked elsewhere shows its badge without a reload.
 */
router.post('/badges', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers.map(String) : [];
    res.json({ badges: await badgesFor(v, numbers) });                 // 🔒 this vendor's leads only
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * ✍️ POST /api/comms/contact { number, first_name, last_name, email }
 *
 * Raj, 2026-10-09: save a caller as a contact from the browser, "so it
 * reflects in the Quo app on my phone as well". Written to Quo itself — the
 * phone app reads the same contacts — and an existing contact for that number
 * is updated, never duplicated. The name then shows on every call and text
 * with that number here at once.
 */
router.post('/contact', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const cfg = await quoConfig();
    if (!cfg.ready || cfg.vendorId !== v) return res.status(403).json({ error: 'Quo is connected to a different account.' });   // 🔒
    const key10 = tenDigits(req.body?.number);
    const firstName = String(req.body?.first_name || '').trim().slice(0, 80);
    const lastName = String(req.body?.last_name || '').trim().slice(0, 80);
    const email = String(req.body?.email || '').trim().slice(0, 160);
    if (key10.length !== 10) return res.status(400).json({ error: 'That is not a phone number.' });
    if (!firstName) return res.status(400).json({ error: 'A first name is needed.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email address does not look right.' });
    const ours = await ownNumbers(cfg.key);
    if (ours.has(key10)) return res.status(400).json({ error: 'That is one of your own Quo numbers.' });

    /* 🔒 Only a number this vendor has actually spoken with — the endpoint
       must not become a way to write anything at all into Quo. */
    const known = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM comms_events WHERE vendor_id = $1
          AND (right(regexp_replace(coalesce(from_number,''),'\\D','','g'),10) = $2
            OR right(regexp_replace(coalesce(to_number,''),'\\D','','g'),10) = $2) LIMIT 1`, v, key10);
    if (!known.length) return res.status(404).json({ error: 'No calls or texts with that number.' });

    forgetContacts();                                            // read Quo's contacts fresh, so an existing one is found
    const existing = (await contactsByNumber(cfg.key)).get(key10);
    const raw = String(req.body.number).trim();
    const e164 = raw.startsWith('+') ? `+${raw.replace(/\D/g, '')}` : `+1${key10}`;
    const saved = await saveContact(cfg.key, { existingId: existing?.id, firstName, lastName, email, number: e164 });
    forgetContacts();

    const name = [firstName, lastName].filter(Boolean).join(' ');
    await prisma.$executeRawUnsafe(
      `UPDATE comms_events SET contact_name = $3 WHERE vendor_id = $1
          AND (right(regexp_replace(coalesce(from_number,''),'\\D','','g'),10) = $2
            OR right(regexp_replace(coalesce(to_number,''),'\\D','','g'),10) = $2)`, v, key10, name);
    res.json({ ok: true, name, updated: saved.updated });
  } catch (e) {
    res.status(e.status && e.status < 500 ? 400 : 500).json({ error: `Quo did not save the contact: ${e.message}` });
  }
});

/**
 * 💬 POST /api/comms/message { number, text } → send a text from Quo.
 *
 * Raj, 2026-10-09: "I want to be able to send text messages in the threads,
 * from the browser or the phone app later on." Sent through Quo, so it goes
 * out from the business number and shows in the Quo app thread as well; it
 * is stored here at once, so it appears in the conversation without waiting
 * for the next sync.
 * Calls cannot be placed this way — Quo's API has no endpoint for it.
 *
 * 🔒 Only to someone this vendor already has a conversation with, at most
 * twenty a minute — a bug or a stolen session must not become a spam cannon.
 */
const MAX_TEXT = 1600;
router.post('/message', requireAuth,
  limit({ name: 'comms-send', max: 20, windowMs: 60_000, key: (req) => String(req.user?.vendor_id || '') }),
  async (req, res) => {
    const v = vid(req);
    try {
      const cfg = await quoConfig();
      if (!cfg.ready || cfg.vendorId !== v) return res.status(403).json({ error: 'Quo is connected to a different account.' });
      const key10 = tenDigits(req.body?.number);
      const text = String(req.body?.text || '').trim();
      if (key10.length !== 10) return res.status(400).json({ error: 'That is not a phone number.' });
      if (!text) return res.status(400).json({ error: 'Write a message first.' });
      if (text.length > MAX_TEXT) return res.status(400).json({ error: `A text can be at most ${MAX_TEXT} characters.` });
      const ours = await ownNumbers(cfg.key);
      if (ours.has(key10)) return res.status(400).json({ error: 'That is one of your own Quo numbers.' });

      /* Which of our lines to send from: the one chosen in Super Admin, or —
         with "every number" — the line this person last spoke to, so the
         reply lands in the same thread on their phone. */
      const last = await prisma.$queryRawUnsafe(
        `SELECT line_id FROM comms_events WHERE vendor_id = $1 AND line_id IS NOT NULL
            AND (right(regexp_replace(coalesce(from_number,''),'\\D','','g'),10) = $2
              OR right(regexp_replace(coalesce(to_number,''),'\\D','','g'),10) = $2)
          ORDER BY occurred_at DESC LIMIT 1`, v, key10);
      if (!last.length) return res.status(404).json({ error: 'No calls or texts with that number yet.' });
      const from = cfg.phoneNumberId || last[0].line_id;

      const raw = String(req.body.number).trim();
      const to = raw.startsWith('+') ? `+${raw.replace(/\D/g, '')}` : `+1${key10}`;
      const msg = await sendMessage(cfg.key, { from, to, content: text });
      const row = msg && normalise('message', msg, ours);
      if (row) {
        row.line_id = row.line_id || from;
        await upsertEvent(v, row);
      }
      const ev = row && await prisma.comms_events.findUnique({ where: { external_id: row.external_id } });
      res.json({ ok: true, event: ev });
    } catch (e) {
      res.status(e.status && e.status < 500 ? 400 : 500).json({ error: `Quo did not send the text: ${e.message}` });
    }
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
    /* Each refusal says what to do. "Not configured" was returned for every
       case — including a sync that was simply already running — and sent Raj
       to a key that was fine while the vendor box sat empty. */
    const cfg = await quoConfig();
    if (!cfg.ready) {
      return res.status(400).json({ error: `Quo is missing ${cfg.missing.join(' and ')} — set it in Super Admin → Settings → Calls & messages.` });
    }
    // 🔒 the mirrored calls belong to ONE vendor; anybody else would sync into a timeline they cannot see
    if (cfg.vendorId !== vid(req)) {
      return res.status(403).json({ error: 'Quo is connected to a different account.' });
    }
    const r = await pollComms();
    if (r.skipped === 'already running') return res.json({ ok: true, added: 0, note: 'A sync is already running — new calls will appear in a moment.' });
    if (r.skipped) return res.status(400).json({ error: `Quo is missing ${(r.missing || []).join(' and ')}.` });
    if (r.error) return res.status(400).json({ error: r.error });
    const note = r.failed ? `⚠️ ${r.added || 0} synced, but Quo refused ${r.failed} request(s) — some calls or messages may be missing.` : undefined;
    res.json({ ok: true, added: r.added || 0, filled: r.filled || 0, ...(note ? { note } : {}) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 🎧 GET /api/comms/:id/recording → the call's audio.
 *
 * Quo's recording link is signed and EXPIRES, so it is never stored: it is
 * asked for fresh here and streamed through. Range requests are passed on,
 * so the player can seek without downloading the whole call first.
 */
router.get('/:id/recording', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const ev = await prisma.comms_events.findFirst({
      where: { id: BigInt(req.params.id), vendor_id: v, kind: 'call' },      // 🔒 tenancy
      select: { external_id: true, recording_url: true },
    });
    if (!ev || !String(ev.recording_url || '').startsWith('quo:')) return res.status(404).json({ error: 'No recording for this call' });
    const cfg = await quoConfig();
    if (cfg.vendorId !== v || !cfg.key) return res.status(404).json({ error: 'No recording for this call' });
    const recs = await getCallRecordings(cfg.key, ev.external_id);
    const want = ev.recording_url.slice(4);
    const rec = recs.find(r => r.id === want) || recs.find(r => r.status === 'completed');
    if (!rec?.url) return res.status(404).json({ error: 'Quo no longer has this recording' });

    const upstream = await fetch(rec.url, { headers: req.headers.range ? { Range: req.headers.range } : {} });
    if (!upstream.ok && upstream.status !== 206) return res.status(502).json({ error: 'Quo did not send the recording' });
    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

/**
 * 📋 POST /api/comms/lead-request { event_id? | call_id? | number? }
 *
 * Raj: "create a lead from this call". Asked from the end-of-call card (the
 * call's id), from a call card (its row id) or from a person's thread (their
 * number → their latest answered call). If Quo has not written the transcript
 * yet the request waits, and the lead is made the moment it arrives
 * (lib/callLeads.js). A booking heard on the call is only ever SUGGESTED.
 */
router.post('/lead-request', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const b = req.body || {};
    let ev = null;
    if (b.event_id) {
      ev = await prisma.comms_events.findFirst({ where: { id: BigInt(b.event_id), vendor_id: v, kind: 'call' }, select: { id: true } });
    } else if (b.call_id) {
      ev = await prisma.comms_events.findFirst({ where: { external_id: String(b.call_id), vendor_id: v, kind: 'call' }, select: { id: true } });
    } else if (b.number) {
      const ten = tenDigits(b.number);
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id FROM comms_events WHERE vendor_id = $1 AND kind = 'call' AND status = 'completed'
            AND (right(regexp_replace(coalesce(from_number,''),'\\D','','g'),10) = $2
              OR right(regexp_replace(coalesce(to_number,''),'\\D','','g'),10) = $2)
          ORDER BY occurred_at DESC LIMIT 1`, v, ten);           // 🔒 this vendor's calls only
      ev = rows[0] || null;
    }
    if (!ev) return res.status(404).json({ error: 'No answered call with this person to make a lead from.' });
    const r = await requestLead(v, ev.id);
    if (r.error) return res.status(404).json(r);
    res.json({ ...r, event_id: Number(ev.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 🟢 POST /api/comms/:id/booking { approve: true | false }
 * Raj's answer to "sounds booked — approve?". Approved, the lead becomes a
 * booking — it moves to Bookings and its date shows on the calendar.
 */
router.post('/:id/booking', requireAuth, async (req, res) => {
  try {
    const r = await answerBooking(vid(req), req.params.id, req.body?.approve === true);   // 🔒 vendor from the token
    if (r.error) return res.status(400).json(r);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
