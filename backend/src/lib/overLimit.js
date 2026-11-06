import prisma from '../config/prisma.js';
import { storageFor } from './storageQuota.js';
import { notify } from '../routes/notifications.js';
import { sendPlatformEmail } from '../routes/email.js';

/**
 * 📏 Over the limit (Raj, 2026-11-06). When a vendor's files are more than their plan + add-ons allow — after moving to a
 * smaller plan, or when a removed add-on ends — they get GRACE_DAYS to delete some or move up a plan, reminded on day 0,
 * day 7 and day 13. After that their galleries and files are LOCKED: not viewable or downloadable, by them or their
 * clients (objectStore.getStream asks mediaLocked). They can still list and delete. Back under, and it all clears.
 */
export const GRACE_DAYS = 15;
const DAY = 86_400_000;
const GB = 1024 ** 3;

/** Where a vendor stands right now — and the stored start of the countdown kept in step with it. */
export async function refreshLimit(vendorId) {
  const vid = Number(vendorId);
  const st = await storageFor(vid);
  const over = st.used_bytes > st.limit_mb * 1024 * 1024;
  const row = await prisma.vendor_settings.findUnique({ where: { vendor_id: vid }, select: { over_limit_since: true, over_limit_stage: true } });   // 🔒 this vendor
  let since = row?.over_limit_since || null;
  if (over && !since) {
    since = new Date();
    await prisma.vendor_settings.upsert({ where: { vendor_id: vid }, update: { over_limit_since: since, over_limit_stage: 0 }, create: { vendor_id: vid, over_limit_since: since } });
  } else if (!over && since) {
    since = null;
    await prisma.vendor_settings.update({ where: { vendor_id: vid }, data: { over_limit_since: null, over_limit_stage: 0 } });
  }
  cache.delete(vid);
  const left = since ? Math.max(0, Math.ceil((since.getTime() + GRACE_DAYS * DAY - Date.now()) / DAY)) : null;
  return {
    over, since, locked: !!since && left === 0, days_left: left, stage: row?.over_limit_stage || 0,
    over_by_gb: over ? Math.round((st.used_bytes - st.limit_mb * 1024 * 1024) / GB * 10) / 10 : 0,
    used_gb: Math.round(st.used_bytes / GB * 10) / 10, limit_gb: Math.round(st.limit_mb / 1024),
  };
}

// a minute's memory per vendor — getStream asks for every photo
const cache = new Map();
export async function mediaLocked(vendorId) {
  const vid = Number(vendorId);
  if (!vid) return false;
  const hit = cache.get(vid);
  if (hit && hit.at > Date.now() - 60_000) return hit.locked;
  const row = await prisma.vendor_settings.findUnique({ where: { vendor_id: vid }, select: { over_limit_since: true } });   // 🔒 this vendor
  const locked = !!row?.over_limit_since && row.over_limit_since.getTime() + GRACE_DAYS * DAY <= Date.now();
  cache.set(vid, { locked, at: Date.now() });
  return locked;
}

const STAGES = [
  // [stage, after days, title, body]
  [1, 0, '💾 You are over your storage', (s) => `Your files are ${s.over_by_gb} GB over your plan. Please delete some or move up a plan within ${GRACE_DAYS} days — after that your galleries and files are locked until you do.`],
  [2, 7, '⏳ 8 days left to sort out your storage', (s) => `You are still ${s.over_by_gb} GB over your plan. Delete some files or move up a plan — in 8 days your galleries and files will be locked.`],
  [3, 13, '⚠️ 2 days left before your files are locked', (s) => `You are ${s.over_by_gb} GB over your plan. In 2 days your galleries and files will be locked — delete some or move up a plan to keep them open.`],
  [4, GRACE_DAYS, '🔒 Your galleries and files are locked', (s) => `You are ${s.over_by_gb} GB over your plan, so your galleries and files are locked. Delete some or move up a plan and they open again straight away.`],
];

/** Hourly: every vendor holding files — start or clear the countdown, and send the reminder that is due (once each). */
export async function sweepOverLimit() {
  const vendors = await prisma.vendors.findMany({ where: { billing_exempt: false }, select: { id: true } });
  for (const { id } of vendors) {
    const s = await refreshLimit(id);
    if (!s.since) continue;
    const age = (Date.now() - s.since.getTime()) / DAY;
    const due = [...STAGES].reverse().find(([stage, after]) => age >= after && stage > s.stage);
    if (!due) continue;
    const [stage, , title, body] = due;
    await notify(id, title, body(s), 'billing', { type: 'tab', id: 'services' });
    const owner = await prisma.users.findFirst({ where: { vendor_id: id }, orderBy: { id: 'asc' }, select: { email: true } });   // 🔒 this vendor
    if (owner?.email) await sendPlatformEmail(owner.email, title.replace(/^\S+\s/, ''), `${body(s)}\n\nManage your plan and storage: https://iwopo.com/panel/services`).catch(() => {});
    await prisma.vendor_settings.update({ where: { vendor_id: id }, data: { over_limit_stage: stage } });
  }
}
