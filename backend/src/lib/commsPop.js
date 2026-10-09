/**
 * 📞 Screen pop — who is calling, while the phone is still ringing.
 *
 * Raj, 2026-10-09: "when a client is calling me, the app should open the
 * history — the summary or transcript of the conversation we had last time."
 * Quo's "call ringing" webhook reaches the server about a second after the
 * phone starts ringing; this gathers what iwopo knows about that number and
 * pushes it down an open connection to the vendor's panel (GET /comms/live).
 *
 * 🔒 Private to the platform owner. It rides on the Calls & messages feature
 * (services.is_private + gate('comms')), it is raised only for the vendor Quo
 * is connected to, and a panel only ever receives its own vendor's pops — so
 * no other vendor, on the web or in a mobile app, ever sees one.
 */
import { EventEmitter } from 'node:events';
import prisma from '../config/prisma.js';
import { badgesFor, tenDigits } from './commsBadges.js';

export const commsBus = new EventEmitter();
commsBus.setMaxListeners(50);                       // a few open tabs, not thousands

const RINGING = ['ringing', 'initiated', 'queued', 'in-progress'];
const MISSED = ['missed', 'no-answer', 'busy', 'failed', 'canceled'];
const sameNumber = `(right(regexp_replace(coalesce(from_number,''),'\\D','','g'),10) = $2
                  OR right(regexp_replace(coalesce(to_number,''),'\\D','','g'),10) = $2)`;

function summaryPoints(body, n = 3) {
  const [main] = String(body || '').split(/\n\s*Next steps:\s*\n/);
  return main.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean).slice(0, n);
}
function transcriptStart(raw, n = 3) {
  try { return (JSON.parse(raw)?.lines || []).slice(0, n).map(l => `${l.us ? 'You' : 'Them'}: ${l.text}`); }
  catch { return raw ? [String(raw).slice(0, 200)] : []; }
}

/** Everything worth seeing in the seconds before answering. */
export async function buildPop(vendorId, number, { skipExternalId } = {}) {
  const v = Number(vendorId), ten = tenDigits(number);
  if (ten.length !== 10) return { number, name: null };
  const [badges, lastCall, texts, named, counts] = await Promise.all([
    badgesFor(v, [ten]),
    prisma.$queryRawUnsafe(
      `SELECT id, occurred_at, duration_sec, status, body, transcript FROM comms_events
        WHERE vendor_id = $1 AND kind = 'call' AND ${sameNumber} AND external_id <> $3
          AND (body IS NOT NULL OR transcript IS NOT NULL)
        ORDER BY occurred_at DESC LIMIT 1`, v, ten, String(skipExternalId || '')),
    prisma.$queryRawUnsafe(
      `SELECT direction, body, occurred_at FROM comms_events
        WHERE vendor_id = $1 AND kind = 'message' AND ${sameNumber}
        ORDER BY occurred_at DESC LIMIT 3`, v, ten),
    prisma.$queryRawUnsafe(
      `SELECT contact_name FROM comms_events WHERE vendor_id = $1 AND contact_name IS NOT NULL AND ${sameNumber}
        ORDER BY occurred_at DESC LIMIT 1`, v, ten),
    prisma.$queryRawUnsafe(
      `SELECT count(*) FILTER (WHERE kind = 'call')::int AS calls, count(*) FILTER (WHERE kind = 'message')::int AS texts
         FROM comms_events WHERE vendor_id = $1 AND ${sameNumber}`, v, ten),
  ]);
  const badge = badges[ten] || null;
  const call = lastCall[0];
  return {
    number,
    name: named[0]?.contact_name || badge?.name || null,
    badge,
    lastCall: call ? {
      event_id: Number(call.id),
      when: call.occurred_at,
      duration_sec: call.duration_sec,
      summary: summaryPoints(call.body),
      opening: call.body ? [] : transcriptStart(call.transcript),
    } : null,
    lastTexts: texts.reverse().map(t => ({ out: t.direction === 'outgoing', body: String(t.body || '').slice(0, 160), when: t.occurred_at })),
    calls: counts[0]?.calls || 0,
    texts: counts[0]?.texts || 0,
  };
}

/* One pop per call: Quo can send "ringing" more than once. */
const popped = new Map();                          // external_id → time
function firstTime(id) {
  const now = Date.now();
  for (const [k, t] of popped) if (now - t > 10 * 60_000) popped.delete(k);
  if (popped.has(id)) return false;
  popped.set(id, now);
  return true;
}

/**
 * Called by the webhook after a call is stored. Rings the vendor's open
 * panels while the call is ringing, and tells them when it ended.
 * @param {string|null} onlyLine  the line chosen in Super Admin — a hidden line never pops
 */
export async function ringScreens(vendorId, row, onlyLine = null) {
  try {
    if (row?.kind !== 'call' || row.direction !== 'incoming') return;
    if (onlyLine && row.line_id && row.line_id !== onlyLine) return;
    if (!commsBus.listenerCount(`v${vendorId}`)) return;            // nobody watching — nothing to build
    if (RINGING.includes(row.status)) {
      if (!firstTime(row.external_id)) return;
      const pop = await buildPop(vendorId, row.from_number, { skipExternalId: row.external_id });
      commsBus.emit(`v${vendorId}`, { phase: 'ringing', call_id: row.external_id, at: new Date().toISOString(), ...pop });
    } else {
      commsBus.emit(`v${vendorId}`, { phase: 'ended', call_id: row.external_id, missed: MISSED.includes(row.status) });
    }
  } catch (e) { console.error('[comms] screen pop:', e.message); }
}
