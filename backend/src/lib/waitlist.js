/**
 * 📝 The waitlist, while sign-ups are paused (Raj, 2026-11-12). An address is kept once. When a new one joins, the
 * owner's inbox is told — unless the Super Admin switch "Email me when someone joins" is off — and Super Admin lists
 * everyone (routes/index.js).
 *
 * 🚪 Opening (Raj, 2026-11-16): Super Admin invites the people who have waited longest, a batch at a time — one email
 * each, never twice. An account made with a waitlist address is linked to it at sign-up, and its first paid plan
 * carries one extra free month as a thank-you for waiting.
 */
import prisma from '../config/prisma.js';
import { getSetting } from './settings.js';
import { OWNER_INBOX } from './ownerInbox.js';
import { noteFailure } from './noteFailure.js';
import { sendPlatformEmail } from '../routes/email.js';

export const WAITLIST_ALERTS = 'waitlist_alerts';
export const WAITLIST_BONUS_DAYS = 30;   // 🎁 the thank-you month
const APP_URL = (process.env.APP_URL || 'https://iwopo.com').replace(/\/+$/, '');
export async function waitlistAlertsOn() {
  return String(await getSetting(WAITLIST_ALERTS, 'true')).toLowerCase() !== 'false';
}

/** Adds an address to the waitlist once. True when it is new. */
export async function joinWaitlist(email) {
  const added = await prisma.waitlist.createMany({ data: [{ email }], skipDuplicates: true });
  if (!added.count) return false;
  if (await waitlistAlertsOn()) {
    const total = await prisma.waitlist.count();
    sendPlatformEmail(OWNER_INBOX, `New on the iwopo waitlist: ${email}`,
      `${email} asked to be told when iwopo opens.\n\nPeople on the waitlist now: ${total}\nSee everyone in Super Admin → Waitlist.`, null, { replyTo: email })
      .catch(e => noteFailure('email the owner about a waitlist sign-up', e));
  }
  return true;
}

/** 🔗 An account made with a waitlist address is linked to it (in the sign-up transaction). */
export function linkWaitlist(tx, { vendorId, email }) {
  return tx.waitlist.updateMany({ where: { email: { equals: String(email || '').trim(), mode: 'insensitive' }, vendor_id: null }, data: { vendor_id: vendorId } });
}

/** 🎁 The extra free days a vendor's first paid checkout carries for having waited — and only the first: none once the
 *  account has ever had a paid subscription. */
export async function waitlistBonus(vendorId) {
  const v = Number(vendorId);
  const [waited, paidBefore] = await Promise.all([
    prisma.waitlist.count({ where: { vendor_id: v } }),                                                      // 🔒 this vendor
    prisma.vendor_subscriptions.count({ where: { vendor_id: v, stripe_subscription_id: { not: null } } }),   // 🔒 this vendor
  ]);
  return waited && !paidBefore ? WAITLIST_BONUS_DAYS : 0;
}

const INVITE_SUBJECT = 'iwopo is open — your invitation';
const inviteText = () => `Hi,\n\nYou asked us to tell you when iwopo opens — it's open now.\n\nSign up: ${APP_URL}/#signup\n\nAs a thank-you for waiting, you get one extra month free when you choose a plan, on top of your free trial. Sign up with this email address so it is yours.\n\n— iwopo`;
const inviteHtml = () => `<p>Hi,</p><p>You asked us to tell you when iwopo opens — it's open now.</p><p><a href="${APP_URL}/#signup">Sign up for iwopo</a></p><p>As a thank-you for waiting, you get <b>one extra month free</b> when you choose a plan, on top of your free trial. Sign up with this email address so it is yours.</p><p>— iwopo</p>`;

/** 📧 Invites the next people who have waited longest (at most 200 at a time), each once. Returns how many went out and
 *  how many are still waiting. */
export async function inviteNext(count) {
  const take = Math.max(1, Math.min(200, Math.floor(Number(count) || 0)));
  const waiting = { invited_at: null, vendor_id: null };
  const people = await prisma.waitlist.findMany({ where: waiting, orderBy: { created_at: 'asc' }, take, select: { id: true, email: true } });
  let sent = 0;
  for (const p of people) {
    try {
      await sendPlatformEmail(p.email, INVITE_SUBJECT, inviteText(), inviteHtml());
      await prisma.waitlist.update({ where: { id: p.id }, data: { invited_at: new Date() } });
      sent += 1;
    } catch (e) { noteFailure('invite someone from the waitlist', e); }
  }
  return { sent, failed: people.length - sent, waiting: await prisma.waitlist.count({ where: waiting }) };
}
