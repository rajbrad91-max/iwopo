import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { currentPlan } from './billing.js';
import { notify } from '../routes/notifications.js';
import { sendPlatformEmail } from '../routes/email.js';

/**
 * 🧹 Free accounts nobody uses (Raj, 2026-11-06). FREE plan only — never an owner, a paying vendor or one in a trial.
 *   no one from the account seen for 6 months → notice (email + panel): sign in to keep your data, or upgrade to download it
 *   a week before the end of month 7          → final notice
 *   end of month 7                             → the business data is removed: leads (with their contracts, invoices and
 *                                                payments), packages, galleries, files, contacts, chat transcripts
 * KEPT: the account itself — login, business, settings, inquiry form, website — so they can come back. Signing in at any
 * point cancels the countdown. Download-your-data is a paid-plan feature; on Free a copy is given on request (support).
 */
const DAY = 86_400_000;
const SIX_MONTHS = 182 * DAY;
const FINAL_AFTER = 23 * DAY, REMOVE_AFTER = 30 * DAY;

const lastSeen = async (vid) => (await prisma.users.aggregate({ where: { vendor_id: vid }, _max: { last_seen_at: true } }))._max.last_seen_at;   // 🔒 this vendor

async function tell(vid, title, body) {
  await notify(vid, title, body, 'billing', { type: 'tab', id: 'plans' });
  const owner = await prisma.users.findFirst({ where: { vendor_id: vid }, orderBy: { id: 'asc' }, select: { email: true } });   // 🔒 this vendor
  if (owner?.email) await sendPlatformEmail(owner.email, title, `${body}\n\nSign in: https://iwopo.com/panel`).catch(() => {});
}

/** What a removal takes — counted only (dryRun) or removed. The account itself is never touched. */
async function purgeFree(vendorId, { dryRun = false } = {}) {
  const v = Number(vendorId);
  const where = { vendor_id: v };                                                   // 🔒 every step is this vendor's
  const steps = [
    ['leads', () => prisma.leads],                       // contracts, invoices, payments, lead packages cascade
    ['packages', () => prisma.vendor_packages], ['package folders', () => prisma.package_templates],
    ['photos', () => prisma.photos], ['gallery folders', () => prisma.album_events], ['galleries', () => prisma.albums],
    ['shared files', () => prisma.file_share_items], ['file shares', () => prisma.file_shares], ['file folders', () => prisma.file_folders],
    ['contacts', () => prisma.contacts], ['chat transcripts', () => prisma.chatbot_transcripts], ['chat messages', () => prisma.chatbot_messages],
  ];
  const counts = {};
  for (const [label, model] of steps) counts[label] = await model().count({ where });
  if (dryRun) return counts;
  await prisma.$transaction(steps.map(([, model]) => model().deleteMany({ where })));
  for (const part of ['galleries', 'files']) {                                      // then their stored files
    const keys = await objects.listAll(objects.PRIVATE, `vendor/${v}/${part}/`).catch(() => []);
    for (const k of keys) await objects.deleteObject(objects.PRIVATE, k.key || k).catch(() => {});
    counts[`stored ${part}`] = keys.length;
  }
  return counts;
}

/** Daily: move each Free account along — or back to the start once someone signs in. */
export async function sweepInactiveFree({ now = Date.now() } = {}) {
  const done = [];
  for (const { id } of await prisma.vendors.findMany({ where: { billing_exempt: false }, select: { id: true } })) {
    const { reason } = await currentPlan(id);
    const st = await prisma.vendor_settings.findUnique({ where: { vendor_id: id }, select: { inactive_stage: true, inactive_notice_at: true } });
    const last = await lastSeen(id);
    const idle = reason === 'free' && last && now - last.getTime() >= SIX_MONTHS;
    if (!idle) {                                                                    // used again, or no longer on Free
      if (st?.inactive_stage && st.inactive_stage < 3) await prisma.vendor_settings.update({ where: { vendor_id: id }, data: { inactive_stage: 0, inactive_notice_at: null } });
      continue;
    }
    const stage = st?.inactive_stage || 0;
    const since = st?.inactive_notice_at ? now - st.inactive_notice_at.getTime() : 0;
    if (stage === 0) {
      await tell(id, '💤 Still using iwopo?', 'No one has signed in to your free account for 6 months. Sign in within 30 days to keep your leads, packages and files — or upgrade to a plan to download a copy. After that your data is removed (your account stays).');
      await prisma.vendor_settings.upsert({ where: { vendor_id: id }, update: { inactive_stage: 1, inactive_notice_at: new Date(now) }, create: { vendor_id: id, inactive_stage: 1, inactive_notice_at: new Date(now) } });
      done.push([id, 'notice']);
    } else if (stage === 1 && since >= FINAL_AFTER) {
      await tell(id, '⏳ One week left to keep your iwopo data', 'Your free account has not been used for nearly 7 months. Sign in within a week to keep your leads, packages and files — or upgrade to download a copy.');
      await prisma.vendor_settings.update({ where: { vendor_id: id }, data: { inactive_stage: 2 } });
      done.push([id, 'final']);
    } else if (stage === 2 && since >= REMOVE_AFTER) {
      const removed = await purgeFree(id);
      await prisma.vendor_settings.update({ where: { vendor_id: id }, data: { inactive_stage: 3 } });
      await tell(id, '🧹 Your iwopo data was removed', 'Your free account was not used for 7 months, so its leads, packages and files were removed. Your account is still here — sign in any time to start again.');
      done.push([id, 'removed', removed]);
    }
  }
  return done;
}
