/**
 * 🔔 Telling the vendor a text or a missed call has arrived.
 *
 * Raj, 2026-10-09: "real-time notifications when there's a message or call."
 * The event already reaches the server the moment it happens (Quo's webhook,
 * or the minute-by-minute sync behind it); this raises it in the panel's
 * notification bell, which rings on every page of the panel — not only on
 * Calls & messages.
 *
 * Only what needs the vendor: a text that came IN, and a call that was
 * missed. An answered call needs no reminder, and a text the vendor sent
 * themselves is not news to them.
 * Only fresh events: the first sync of a line brings a month of history, and
 * a month of history must not arrive as a hundred notifications.
 */
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { notifyPrivate } from './privateNotify.js';

const FRESH_MS = 15 * 60_000;
const MISSED = ['missed', 'no-answer', 'busy', 'failed', 'canceled'];

/** Who is this, in words — their lead's name if they have one, else the number. */
async function whoIs(vendorId, number) {
  const ten = String(number || '').replace(/\D/g, '').slice(-10);
  if (ten.length !== 10) return 'an unknown number';
  const lead = await prisma.$queryRawUnsafe(
    `SELECT name FROM leads WHERE vendor_id = $1 AND name IS NOT NULL
        AND right(regexp_replace(coalesce(phone,''),'\\D','','g'),10) = $2
      ORDER BY created_at DESC LIMIT 1`, Number(vendorId), ten).catch(() => []);
  if (lead[0]?.name) return lead[0].name;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Call after an event is stored — created or updated. A call usually arrives
 * twice: "ringing" first, then "completed" with its final status, and only
 * the second says it was missed. So both are looked at, and the bell rings
 * ONCE per event: a notification already raised for it is never raised again.
 */
export async function announce(vendorId, row, onlyLine = null) {
  try {
    if (!row || row.direction !== 'incoming') return;
    // the timeline shows only the line chosen in Super Admin — the bell must not ring for one it hides
    if (onlyLine && row.line_id && row.line_id !== onlyLine) return;
    if (Date.now() - new Date(row.occurred_at).getTime() > FRESH_MS) return;
    const isText = row.kind === 'message';
    const isMissed = row.kind === 'call' && MISSED.includes(row.status);
    if (!isText && !isMissed) return;

    const ev = await privateDb.comms_events.findUnique({ where: { external_id: row.external_id }, select: { id: true, contact_name: true } });
    if (!ev) return;
    const already = await privateDb.comms_notices.findFirst({
      where: { vendor_id: Number(vendorId), link_type: 'comms', link_id: Number(ev.id) }, select: { id: true },
    });
    if (already) return;
    const who = ev.contact_name || await whoIs(vendorId, row.from_number);
    const title = isText ? `💬 New text from ${who}` : `📞 Missed call from ${who}`;
    const body = isText ? String(row.body || '').slice(0, 140) : null;
    await notifyPrivate(vendorId, title, body, 'comms', { type: 'comms', id: Number(ev.id) });
  } catch { /* a notification must never break storing the call */ }
}
