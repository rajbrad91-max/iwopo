/**
 * 🏷️ Is the person on the other end one of this vendor's leads — or booked?
 *
 * Raj, 2026-10-09: "if the client who's texting or calling has ever sent an
 * inquiry or has ever booked us, past or future, detect his number in the
 * leads or bookings and give it the badge." Numbers are compared on their
 * last ten digits, so "+1 (778) 910-8094", "778-910-8094" and "7789108094"
 * are the same person. Booked (or completed) wins over any open lead.
 *
 * Used by the timeline, the half-minute badge refresh and the screen pop —
 * one definition, so the three can never disagree.
 * 🔒 Only this vendor's leads are ever read.
 */
import prisma from '../config/prisma.js';

const BOOKED = ['booked', 'completed'];
export const tenDigits = (n) => String(n || '').replace(/\D/g, '').slice(-10);

/** @returns {Promise<Record<string, {kind:'lead'|'booked', lead_id, name, email, status, event_date}>>} keyed by ten digits */
export async function badgesFor(vendorId, rawNumbers) {
  const keys = [...new Set(rawNumbers.map(tenDigits).filter(k => k.length === 10))].slice(0, 500);
  if (!keys.length) return {};
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, name, email, status, event_date, created_at,
            right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) AS k
       FROM leads
      WHERE vendor_id = $1
        AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ANY($2::text[])`,
    Number(vendorId), keys);
  const out = {};
  for (const r of rows) {
    const booked = BOOKED.includes(r.status);
    const cur = out[r.k];
    // booked beats a lead; between two of the same kind, the latest event (or newest inquiry) wins
    const better = !cur
      || (booked && cur.kind !== 'booked')
      || (booked === (cur.kind === 'booked') && new Date(r.event_date || r.created_at) > new Date(cur.sort));
    if (better) {
      out[r.k] = {
        kind: booked ? 'booked' : 'lead',
        lead_id: r.id, name: r.name || null, email: r.email || null, status: r.status,
        event_date: r.event_date, sort: r.event_date || r.created_at,
      };
    }
  }
  for (const b of Object.values(out)) delete b.sort;
  return out;
}

/** The badges for every person in a list of timeline events. */
export function leadBadges(vendorId, events) {
  return badgesFor(vendorId, events.map(e => (e.direction === 'incoming' ? e.from_number : e.to_number)));
}
