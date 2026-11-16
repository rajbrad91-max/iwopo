/**
 * ⏳ When a vendor's access ends — a trial that ran out unpaid, or a paid plan that lapsed (Raj, 2026-11-15). There is
 * no Free plan: an account is open, or it is on its way to being cleared, and paying at any point brings back whatever
 * is still there.
 *
 *   day −7, −2   notice: the trial ends soon (trials only — Stripe tells a paying vendor about their card)
 *   day 0        READ-ONLY: nothing new — the inquiry form and the assistant close, no new leads, no uploads, no
 *                changes. The vendor can sign in, look and download; their couples' links still open.
 *   day +5       notice: suspended in 2 days
 *   day +7       SUSPENDED: signing in shows only Plans; couples' links, the website and the client portal close
 *   day +12      notice: data can be removed from day 14
 *   day +26      notice: photos, videos and files are removed in 2 days
 *   day +28      photos, videos and files removed
 *   day +58      notice: leads, bookings and records are removed in 2 days
 *   day +60      records removed — the login, business, settings and website stay, so they can come back
 *
 * The notices say data "can be removed from day 14"; removal itself waits, so a late renewal still gets everything back.
 *
 * Day 0 is vendors.lapsed_at, stamped by the sweep the first time it finds the account closed — never further back
 * than one sweep, so an account that closed long ago (or before this existed) still gets every notice in turn.
 * vendors.lapse_step remembers how far an account has gone, so each step happens once across restarts and only one
 * step is taken per sweep; a removal also waits until the notice before it is two days old. Paying clears both.
 */
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { billingAccess, trialEnd, paidSubscription } from './billing.js';
import { notify } from '../routes/notifications.js';
import { sendPlatformEmail } from '../routes/email.js';
import { quiet } from './quiet.js';

const DAY = 86_400_000;
const SWEEP_EVERY = 6 * 60 * 60_000;
export const READ_ONLY_DAYS = 7;
const APP_URL = (process.env.APP_URL || 'https://iwopo.com').replace(/\/+$/, '');

/* ───────────────────────── where an account stands ───────────────────────── */

/* Open accounts are remembered for 30 seconds (one API process — pm2 fork mode), so the checks on every request cost
   nothing for the vendors who have access. A closed account is always looked up fresh: paying must open it at once. */
const openSeen = new Map();

/** { stage: 'open' | 'readonly' | 'suspended', access, lapsedAt } */
export async function accountStage(vendorId) {
  const vid = Number(vendorId);
  if ((openSeen.get(vid) || 0) > Date.now() - 30_000) return { stage: 'open', access: null, lapsedAt: null };
  const access = await billingAccess(vid);
  if (access.allowed) { openSeen.set(vid, Date.now()); return { stage: 'open', access, lapsedAt: null }; }
  const row = await prisma.vendors.findUnique({ where: { id: vid }, select: { lapsed_at: true } });
  const lapsedAt = row?.lapsed_at || null;                                         // not stamped yet: it closed just now
  const days = lapsedAt ? (Date.now() - lapsedAt.getTime()) / DAY : 0;
  return { stage: days >= READ_ONLY_DAYS ? 'suspended' : 'readonly', access, lapsedAt };
}

/**
 * May the public reach this vendor?
 *   'new'  — anything that brings in new business or changes something: open only while the account is
 *   'view' — a couple opening what was shared with them, the vendor's website: open until the account is suspended
 */
export async function openTo(vendorId, need) {
  const { stage } = await accountStage(vendorId);
  return stage === 'open' || (need === 'view' && stage === 'readonly');
}

/** The dates a closed account will reach each stage — for the panel and the notices. */
export function lapseDates(lapsedAt) {
  const at = (days) => (lapsedAt ? new Date(lapsedAt.getTime() + days * DAY) : null);
  return { suspends_at: at(READ_ONLY_DAYS), removable_from: at(14), media_removed_at: at(28), records_removed_at: at(60) };
}

/* ───────────────────────── removal ───────────────────────── */

/** Photos, videos and files: every gallery (shoots and live shoots too), every File Flyer folder and share, and what
 *  they keep in storage. 🔒 Every step is this vendor's. */
async function removeMedia(v) {
  const where = { vendor_id: v };
  await prisma.$transaction([
    prisma.albums.deleteMany({ where }),                // photos, faces, raw files, favourites and selections go with them
    prisma.file_share_items.deleteMany({ where }), prisma.file_shares.deleteMany({ where }), prisma.file_folders.deleteMany({ where }),
    prisma.pending_uploads.deleteMany({ where }),
  ]);
  for (const part of ['galleries', 'files', 'raws']) {
    const keys = await objects.listAll(objects.PRIVATE, `vendor/${v}/${part}/`).catch(() => []);
    for (const k of keys) await objects.deleteObject(objects.PRIVATE, k.key || k).catch(quiet('remove a closed account’s stored file'));
  }
}

/** Leads (their contracts, invoices, payments and packages go with them), packages, contacts and the assistant's
 *  conversations. The account itself — login, business, settings, inquiry form, website — stays. 🔒 This vendor's. */
async function removeRecords(v) {
  const where = { vendor_id: v };
  await prisma.$transaction([
    prisma.leads.deleteMany({ where }),
    prisma.vendor_packages.deleteMany({ where }), prisma.package_templates.deleteMany({ where }),
    prisma.contacts.deleteMany({ where }),
    prisma.chatbot_transcripts.deleteMany({ where }), prisma.chatbot_messages.deleteMany({ where }),
  ]);
  const keys = await objects.listAll(objects.PRIVATE, `vendor/${v}/contracts/`).catch(() => []);   // the signed PDFs
  for (const k of keys) await objects.deleteObject(objects.PRIVATE, k.key || k).catch(quiet('remove a closed account’s signed contract'));
}

/* ───────────────────────── the steps ───────────────────────── */

const day = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/* Each step: the day it is due, what it says, and (for the two removals) what it does. */
const STEPS = [
  { at: 0, title: 'Your iwopo account is now read-only',
    line: (d) => `Your account is now read-only: you can sign in, look at and download everything, but nothing new comes in — your inquiry form is closed and nothing can be added or changed. Choose a plan to switch everything back on. If you don't, your account will be suspended on ${day(d.suspends_at)}.` },
  { at: 5, title: 'Your iwopo account will be suspended in 2 days',
    line: (d) => `On ${day(d.suspends_at)} your account will be suspended: you won't be able to use it, and your clients' galleries, files, portal and your website will stop opening. Choose a plan to keep everything running.` },
  { at: 7, title: 'Your iwopo account is suspended',
    line: (d) => `Heads up: your account is suspended. Choose a plan to open it again — from ${day(d.removable_from)} your photos, videos, files, leads and bookings can be removed.` },
  { at: 12, title: 'Your iwopo data can be removed in 2 days',
    line: (d) => `From ${day(d.removable_from)} your photos, videos, files, leads and bookings can be removed. Choose a plan before then to keep everything.` },
  { at: 26, title: 'Your photos, videos and files will be removed in 2 days',
    line: (d) => `On ${day(d.media_removed_at)} the photos, videos and files in your iwopo account will be removed for good. Choose a plan before then to keep them.` },
  { at: 28, remove: removeMedia, title: 'Your photos, videos and files were removed',
    line: (d) => `The photos, videos and files in your iwopo account have been removed. Your leads and bookings are kept until ${day(d.records_removed_at)} — choose a plan to keep them.` },
  { at: 58, title: 'Your leads and bookings will be removed in 2 days',
    line: (d) => `On ${day(d.records_removed_at)} the leads, bookings, contracts, invoices and packages in your iwopo account will be removed for good. Choose a plan before then to keep them.` },
  { at: 60, remove: removeRecords, title: 'Your iwopo data was removed',
    line: () => 'The leads, bookings and records in your iwopo account have been removed. Your account is still here — sign in any time and choose a plan to start again.' },
];

/* Before the trial ends (vendors.trial_reminders counts them) */
const SOON = [
  { n: 1, left: 7 * DAY, title: '7 days left in your iwopo trial', line: 'Your free trial ends in 7 days. Choose a plan any time — billing only starts when the trial ends.' },
  { n: 2, left: 2 * DAY, title: 'Your iwopo trial ends in 2 days', line: 'Your free trial ends in 2 days. When it ends your account becomes read-only — choose a plan to keep everything running without a break.' },
];

async function tell(v, title, line) {
  notify(v.id, title, line, 'plans', { type: 'plans' });
  const owner = await prisma.users.findFirst({ where: { vendor_id: v.id, role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true, name: true } });   // 🔒 this vendor
  if (!owner?.email) return;
  const hi = `Hi ${owner.name || v.business_name},`;
  await sendPlatformEmail(owner.email, title,
    `${hi}\n\n${line}\n\nChoose a plan: ${APP_URL}/panel/plans\n\n— iwopo`,
    `<p>${hi}</p><p>${line}</p><p><a href="${APP_URL}/panel/plans">Choose a plan</a></p><p>— iwopo</p>`,
  ).catch(quiet('email a vendor about their account'));
}

/** One pass over every account that is billed: move each a step along, or back to the start once it has access. */
export async function sweepLapsed({ now = Date.now() } = {}) {
  const done = [];
  const vendors = await prisma.vendors.findMany({
    where: { billing_exempt: false },
    select: { id: true, business_name: true, status: true, trial_ends_at: true, created_at: true, trial_reminders: true, lapsed_at: true, lapse_step: true, lapse_step_at: true },
  });
  for (const v of vendors) {
    const access = await billingAccess(v.id);
    if (access.allowed) {
      if (v.lapsed_at) {                                                          // paid again: back to the start
        await prisma.vendors.update({ where: { id: v.id }, data: { lapsed_at: null, lapse_step: 0, lapse_step_at: null } });
        done.push([v.id, 'reopened']);
      }
      if (access.reason !== 'trial' || await paidSubscription(v.id)) continue;
      const left = trialEnd(v).getTime() - now;
      const due = SOON.filter(s => s.n > (v.trial_reminders || 0) && left <= s.left).pop();     // only the latest one due
      if (!due) continue;
      await prisma.vendors.update({ where: { id: v.id }, data: { trial_reminders: due.n } });   // mark first: never twice
      await tell(v, due.title, due.line);
      done.push([v.id, `trial notice ${due.n}`]);
      continue;
    }
    // closed: day 0 is the trial's end if this sweep is the first to see it, else now — never older than one sweep
    const lapsedAt = v.lapsed_at || new Date(Math.max(trialEnd(v).getTime(), now - SWEEP_EVERY));
    if (!v.lapsed_at) await prisma.vendors.update({ where: { id: v.id }, data: { lapsed_at: lapsedAt } });
    const step = STEPS[v.lapse_step || 0];
    if (!step || now - lapsedAt.getTime() < step.at * DAY) continue;
    if (step.remove && (!v.lapse_step_at || now - v.lapse_step_at.getTime() < 2 * DAY)) continue;   // its notice first, 2 days ahead
    if (step.remove) await step.remove(v.id);
    await prisma.vendors.update({ where: { id: v.id }, data: { lapse_step: (v.lapse_step || 0) + 1, lapse_step_at: new Date(now) } });
    await tell(v, step.title, step.line(lapseDates(lapsedAt)));
    done.push([v.id, step.title]);
  }
  return done;
}

/** Start the sweep: shortly after boot, then every 6 hours. */
export function startLapseSweep() {
  const run = () => sweepLapsed().catch(quiet('sweep accounts whose access has ended'));
  setTimeout(run, 60_000).unref();
  setInterval(run, SWEEP_EVERY).unref();
}
