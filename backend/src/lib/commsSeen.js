/**
 * 👁️ Which calls and texts the owner has seen (Raj, 2026-10-23). One small record per account:
 * { "<last 10 digits of a number>": "<seen up to>", "*": "<everything seen up to>" }.
 * A text received or a call missed after that moment is unread. Opening a conversation, or Tornado
 * reporting it, moves the moment forward. The first time, the existing history counts as seen.
 */
import prisma from '../config/prisma.js';
const keyOf = (v) => `comms_seen_${Number(v)}`;

export async function seenMap(v) {
  const r = await prisma.platform_settings.findUnique({ where: { key: keyOf(v) } });
  if (!r) return markSeen(v, 'all');                     // first time: history is already seen
  try { return JSON.parse(r.value) || {}; } catch { return {}; }
}

/** keys: an array of person keys (last 10 digits) or 'all'. */
export async function markSeen(v, keys, at = new Date()) {
  const r = await prisma.platform_settings.findUnique({ where: { key: keyOf(v) } });
  let m; try { m = r ? JSON.parse(r.value) || {} : {}; } catch { m = {}; }
  if (keys === 'all') m = { '*': at.toISOString() };      // everything up to now; older per-person marks are covered
  else for (const k of keys) if (/^\d{4,10}$/.test(String(k))) m[k] = at.toISOString();
  const value = JSON.stringify(m);
  await prisma.platform_settings.upsert({ where: { key: keyOf(v) }, create: { key: keyOf(v), value }, update: { value } });
  return m;
}

/** 🔴 unread calls & texts: texts received and calls missed after the moment each person was last seen */
export async function unreadCalls(v, privateDb) {
  const m = await seenMap(v);
  const floor = new Date(Math.max(Date.parse(m['*'] || 0) || 0, Date.now() - 60 * 86400e3));
  const evs = await privateDb.comms_events.findMany({
    where: { vendor_id: Number(v), occurred_at: { gt: floor }, OR: [{ kind: 'message', direction: 'incoming' }, { kind: 'call', direction: { not: 'outgoing' }, status: { in: ['missed', 'no-answer', 'canceled', 'busy', 'failed'] } }] },
    select: { from_number: true, to_number: true, direction: true, occurred_at: true },
  });
  return evs.filter(e => { const k = String(e.from_number || '').replace(/\D/g, '').slice(-10); return !m[k] || Date.parse(m[k]) < e.occurred_at.getTime(); }).length;
}
