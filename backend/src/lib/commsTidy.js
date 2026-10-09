/**
 * 🧹 Keeping the call & text history from piling up.
 *
 * Raj, 2026-10-09: "I'm worried about transcripts and texts piling up in my
 * database secretly — if we delete on Quo they should be deleted here too."
 * Two nightly jobs, both scoped to the vendor Quo is connected to:
 *
 *  1. 🔁 Mirror Quo's deletions. Quo announces no deletions, so each stored
 *     call and text is re-asked about in turn (CHECK_BATCH a night, the
 *     longest-unchecked first); one Quo answers "not found" for is deleted
 *     here as well. ⚠️ Only a definite 404 deletes — a timeout, a rate limit
 *     or any other error leaves the row alone. A network blip must never
 *     empty a timeline.
 *
 *  2. ⏳ Forget the old. Calls and texts older than RETAIN_MONTHS are removed
 *     — EXCEPT for anybody who is a lead or a booking: that history is the
 *     business record, and it stays.
 *
 * What goes is the iwopo copy only: the call row, its summary and transcript,
 * and the bell notifications pointing at it. A lead made from a call keeps
 * its own notes. Quo's own copy is untouched (its API cannot delete).
 */
import prisma from '../config/prisma.js';
import { quoConfig, getCall, getMessage } from './quo.js';
import { badgesFor, tenDigits } from './commsBadges.js';

export const RETAIN_MONTHS = 12;
const CHECK_BATCH = 500;                       // ~90 s of paced requests a night
const RECHECK_DAYS = 7;                        // each row is re-asked about roughly weekly

async function removeEvents(ids) {
  if (!ids.length) return 0;
  await prisma.notifications.deleteMany({ where: { link_type: 'comms', link_id: { in: ids.map(Number) } } });
  const r = await prisma.comms_events.deleteMany({ where: { id: { in: ids } } });
  return r.count;
}

/** 1 — anything Quo no longer has is removed here too. */
export async function mirrorQuoDeletions(cfg) {
  const rows = await prisma.comms_events.findMany({
    where: {
      vendor_id: cfg.vendorId,
      OR: [{ checked_at: null }, { checked_at: { lt: new Date(Date.now() - RECHECK_DAYS * 864e5) } }],
    },
    orderBy: [{ checked_at: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    take: CHECK_BATCH,
    select: { id: true, external_id: true, kind: true },
  });
  const gone = [], seen = [];
  for (const r of rows) {
    try {
      // getCall / getMessage answer null only on a definite 404 (see quo.js optional())
      const found = r.kind === 'call' ? await getCall(cfg.key, r.external_id) : await getMessage(cfg.key, r.external_id);
      (found ? seen : gone).push(r.id);
    } catch { /* not a definite "not found" — leave it, ask again another night */ }
  }
  if (seen.length) await prisma.comms_events.updateMany({ where: { id: { in: seen } }, data: { checked_at: new Date() } });
  return { checked: rows.length, removed: await removeEvents(gone) };
}

/** 3 — older than RETAIN_MONTHS, and not a lead or a booking: removed. */
export async function forgetOld(cfg) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETAIN_MONTHS);
  const old = await prisma.comms_events.findMany({
    where: { vendor_id: cfg.vendorId, occurred_at: { lt: cutoff } },
    select: { id: true, direction: true, from_number: true, to_number: true },
    take: 5000,
  });
  if (!old.length) return { removed: 0, kept: 0 };
  const other = (e) => (e.direction === 'incoming' ? e.from_number : e.to_number);
  const badges = await badgesFor(cfg.vendorId, old.map(other));
  const drop = old.filter(e => !badges[tenDigits(other(e))]).map(e => e.id);
  return { removed: await removeEvents(drop), kept: old.length - drop.length };
}

/** Both, once a night. A run that fails is simply tried again the next night. */
export async function tidyComms() {
  try {
    const cfg = await quoConfig();
    if (!cfg.ready) return null;
    const mirrored = await mirrorQuoDeletions(cfg);
    const aged = await forgetOld(cfg);
    if (mirrored.removed || aged.removed) {
      console.log(`[comms] tidy: ${mirrored.removed} gone from Quo, ${aged.removed} older than ${RETAIN_MONTHS} months removed (${aged.kept} kept — leads/bookings)`);
    }
    return { mirrored, aged };
  } catch (e) { console.error('[comms] tidy failed:', e.message); return null; }
}
