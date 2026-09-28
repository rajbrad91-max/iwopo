/**
 * 🎉 Anniversaries and birthdays — wishing clients on the day it matters.
 *
 * The occasions themselves are not stored. An anniversary is a lead's
 * event_date coming round again, so it is COMPUTED: a stored copy would drift
 * the moment somebody corrected a date, and the correction is the likelier
 * event.
 *
 * What is stored is what was SENT, so nobody is wished twice in one year —
 * the failure that would embarrass Raj rather than delight a client.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { sendAsVendor } from './email.js';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);

/* How far ahead to look. Raj asked for two or three days' warning; a fortnight
   is the window the PAGE shows, and the reminder fires closer. Seeing it early
   is a choice, being told late is not. */
const AHEAD_DAYS = 45;
const NOTIFY_DAYS = 3;

/** The next time a day-and-month comes round, from today. */
function nextOccurrence(when, from = new Date()) {
  const d = new Date(when);
  if (isNaN(d)) return null;
  const y = from.getUTCFullYear();
  let next = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
  /* Today counts — somebody opening this on the morning of the anniversary
     should see it, not be told they missed it. */
  const today = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  if (next < today) next = new Date(Date.UTC(y + 1, d.getUTCMonth(), d.getUTCDate()));
  return next;
}

const daysBetween = (a, b) => Math.round((b - a) / 864e5);

/**
 * Build the list of upcoming occasions for a vendor.
 * Exported so the nightly reminder uses exactly the same logic as the page —
 * two implementations of "whose anniversary is it" would disagree eventually.
 */
export async function upcomingFor(vendorId, aheadDays = AHEAD_DAYS) {
  const leads = await prisma.leads.findMany({
    where: {
      vendor_id: Number(vendorId),                 // 🔒 tenancy
      archived_at: null,
      email: { not: null },
      OR: [{ event_date: { not: null } }, { client_birthday: { not: null } }],
    },
    select: {
      id: true, name: true, email: true, event_type: true,
      event_date: true, client_birthday: true, status: true,
    },
  });

  const today = new Date();
  const out = [];

  for (const l of leads) {
    if (!l.email) continue;

    /* An anniversary needs the event to have HAPPENED. A wedding three months
       away is a booking, not an anniversary, and wishing somebody a happy
       first anniversary before the day would be worse than saying nothing. */
    if (l.event_date && new Date(l.event_date) < today) {
      const on = nextOccurrence(l.event_date, today);
      const days = daysBetween(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), on);
      if (on && days <= aheadDays) {
        out.push({
          lead_id: l.id, name: l.name, email: l.email,
          kind: 'anniversary',
          event_type: l.event_type || null,
          original: l.event_date,
          occasion_on: on,
          days_away: days,
          years: on.getUTCFullYear() - new Date(l.event_date).getUTCFullYear(),
        });
      }
    }

    if (l.client_birthday) {
      const on = nextOccurrence(l.client_birthday, today);
      const days = daysBetween(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), on);
      if (on && days <= aheadDays) {
        out.push({
          lead_id: l.id, name: l.name, email: l.email,
          kind: 'birthday',
          event_type: null,
          original: l.client_birthday,
          occasion_on: on,
          days_away: days,
          years: null,
        });
      }
    }
  }

  /* Which of these have already been wished this time round. */
  if (out.length) {
    const sent = await prisma.occasion_greetings.findMany({
      where: {
        vendor_id: Number(vendorId),
        OR: out.map(o => ({ lead_id: o.lead_id, kind: o.kind, occasion_on: o.occasion_on })),
      },
      select: { lead_id: true, kind: true, occasion_on: true, sent_at: true },
    });
    const key = (o) => `${o.lead_id}|${o.kind}|${new Date(o.occasion_on).toISOString().slice(0, 10)}`;
    const done = new Map(sent.map(s => [key(s), s.sent_at]));
    for (const o of out) o.sent_at = done.get(key(o)) || null;
  }

  out.sort((a, b) => a.days_away - b.days_away);
  return out;
}

/* ── the default wording ──────────────────────────────────────────────── */

/* A starting point, not a finished message. Raj edits it once in Settings and
   from then on it is his; until he does, this is what a draft says. */
const DEFAULTS = {
  anniversary: {
    subject: 'Happy anniversary, {name}! 🎉',
    body: `Dear {name},

{years} year{s} ago today we had the joy of photographing your {event}. We still think about that day — thank you for letting us be part of it.

Wishing you both a very happy anniversary, and many more to come.

If you would ever like your photographs reprinted, an album made, or a family session to mark the occasion, just reply to this note — we would love to hear from you.

Warmly,
{studio}`,
  },
  birthday: {
    subject: 'Happy birthday, {name}! 🎂',
    body: `Dear {name},

Wishing you a very happy birthday from all of us. We hope the day is a lovely one.

If you are marking it with a celebration and would like it photographed, do get in touch — it would be a pleasure.

Warmly,
{studio}`,
  },
};

/** Fill the placeholders. Anything unknown becomes empty rather than leaving
    a {curly} in a message a client will read. */
function fill(text, o, studio) {
  const d = new Date(o.occasion_on);
  return String(text || '')
    .replaceAll('{name}', o.name || 'there')
    .replaceAll('{years}', o.years != null ? String(o.years) : '')
    .replaceAll('{s}', o.years === 1 ? '' : 's')
    .replaceAll('{event}', (o.event_type || 'wedding').toLowerCase())
    .replaceAll('{studio}', studio || '')
    .replaceAll('{date}', d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }));
}

async function templateFor(vendorId, kind) {
  const row = await prisma.email_templates.findFirst({
    where: { vendor_id: Number(vendorId), name: 'occasion_' + kind },   // 🔒 tenancy
    select: { subject: true, body: true },
  });
  return { ...DEFAULTS[kind], ...(row || {}) };
}

/* ── routes ───────────────────────────────────────────────────────────── */

/** GET /api/occasions → who is coming up, and who has been wished. */
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    res.json({ occasions: await upcomingFor(v), notify_days: NOTIFY_DAYS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/occasions/draft?lead_id=&kind= → the message, ready to edit.
 *
 * Drafted on the server rather than in the browser so the nightly reminder and
 * the page produce the same words.
 */
router.get('/draft', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const kind = req.query.kind === 'birthday' ? 'birthday' : 'anniversary';
    const all = await upcomingFor(v, 400);
    const o = all.find(x => x.lead_id === Number(req.query.lead_id) && x.kind === kind);
    if (!o) return res.status(404).json({ error: 'Not found' });

    const vendor = await prisma.vendors.findUnique({
      where: { id: v }, select: { business_name: true },
    });
    const t = await templateFor(v, kind);
    res.json({
      occasion: o,
      subject: fill(t.subject, o, vendor?.business_name),
      body: fill(t.body, o, vendor?.business_name),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET/PUT /api/occasions/template?kind= → the wording Raj can edit. */
router.get('/template', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const kind = req.query.kind === 'birthday' ? 'birthday' : 'anniversary';
    res.json({ kind, template: await templateFor(v, kind), defaults: DEFAULTS[kind] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/template', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const kind = req.body?.kind === 'birthday' ? 'birthday' : 'anniversary';
    const name = 'occasion_' + kind;
    const subject = String(req.body?.subject || '').slice(0, 300);
    const body = String(req.body?.body || '');
    if (!subject.trim() || !body.trim()) {
      return res.status(400).json({ error: 'A greeting needs both a subject and a message.' });
    }
    const existing = await prisma.email_templates.findFirst({
      where: { vendor_id: v, name }, select: { id: true },              // 🔒 tenancy
    });
    if (existing) await prisma.email_templates.update({ where: { id: existing.id }, data: { subject, body } });
    else await prisma.email_templates.create({ data: { vendor_id: v, name, subject, body } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/occasions/send → actually wish them.
 *
 * 🔒 The lead is re-read against the vendor on the token, so the address it
 * goes to comes from the database rather than from the request.
 */
router.post('/send', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const kind = req.body?.kind === 'birthday' ? 'birthday' : 'anniversary';
    const leadId = Number(req.body?.lead_id);
    const lead = await prisma.leads.findFirst({
      where: { id: leadId, vendor_id: v },                              // 🔒 tenancy
      select: { id: true, name: true, email: true },
    });
    if (!lead?.email) return res.status(404).json({ error: 'That client has no email address.' });

    const all = await upcomingFor(v, 400);
    const o = all.find(x => x.lead_id === leadId && x.kind === kind);
    if (!o) return res.status(404).json({ error: 'No such occasion.' });

    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!subject || !body) return res.status(400).json({ error: 'Write a subject and a message first.' });

    await sendAsVendor(v, {
      to: lead.email,
      subject,
      text: body,
      html: body.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join(''),
    });

    /* Recorded only after the send succeeds. Marking it first would mean a
       failed email is never retried and the client is never wished. */
    await prisma.occasion_greetings.upsert({
      where: { lead_id_kind_occasion_on: { lead_id: leadId, kind, occasion_on: o.occasion_on } },
      update: { subject, body, sent_at: new Date() },
      create: { vendor_id: v, lead_id: leadId, kind, occasion_on: o.occasion_on, subject, body },
    });

    res.json({ ok: true, to: lead.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export { NOTIFY_DAYS };
export default router;
