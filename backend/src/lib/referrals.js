import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { stripe } from './stripe.js';
import { paidSubscription } from './billing.js';

/**
 * 🎟️ Referrals (Raj, 2026-11-07). Each vendor has a code (iwopo.com/?ref=CODE). A friend who signs up with it — or
 * whose email a vendor invited — is linked to them, and then both get a free month:
 *   the friend: their first month free when they choose a paid plan (30 more free days at their first checkout);
 *   the referrer: once the friend has really paid — a Stripe credit of one month if they pay by card, otherwise it is
 *   owed and added as free days at their own first checkout.
 * referrals.status: pending (invited by email) → joined (signed up) → rewarded (the referrer has had their month)
 *   or owed (the referrer's month is waiting for their first checkout).
 */
export const REFERRAL_DAYS = 30;
const DAY = 86_400_000;
export const normCode = (c) => String(c || '').trim().toUpperCase();

export async function newReferralCode(db, businessName) {
  const base = String(businessName || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'IWOPO';
  for (let i = 0; i < 8; i++) {
    const code = `${base}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    if (!await db.vendors.findFirst({ where: { referral_code: code }, select: { id: true } })) return code;
  }
  return `${base}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const ownerEmail = async (vendorId, db = prisma) => (await db.users.findFirst({ where: { vendor_id: Number(vendorId), role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true } }))?.email?.toLowerCase() || null;

export async function referrerByCode(code, db = prisma) {
  const c = normCode(code);
  return c ? db.vendors.findFirst({ where: { referral_code: c }, select: { id: true, business_name: true } }) : null;
}

/** At sign-up: link the new account to whoever referred it — the code typed, or an email invite waiting for them. */
export async function linkReferral(tx, { friendVendorId, friendEmail, code }) {
  const email = String(friendEmail).trim().toLowerCase();
  const ref = code ? await referrerByCode(code, tx) : null;
  const referrerEmail = ref ? await ownerEmail(ref.id, tx) : null;
  const invite = await tx.referrals.findFirst({ where: { friend_email: email, status: 'pending', ...(referrerEmail ? { referrer_email: referrerEmail } : {}) }, orderBy: { id: 'asc' } });
  if (invite) return tx.referrals.update({ where: { id: invite.id }, data: { status: 'joined', friend_vendor_id: friendVendorId } });
  if (referrerEmail && referrerEmail !== email) return tx.referrals.create({ data: { referrer_email: referrerEmail, friend_email: email, status: 'joined', friend_vendor_id: friendVendorId } });
  return null;
}

/** 🎁 The free days a vendor's first checkout carries: their own first month as a referred friend, and a month for each
 *  friend of theirs who paid while they were not yet paying by card. */
export async function referralBonus(vendorId) {
  const asFriend = await prisma.referrals.findFirst({ where: { friend_vendor_id: Number(vendorId), friend_rewarded_at: null, status: { in: ['joined', 'owed', 'rewarded'] } }, select: { id: true } });
  const me = await ownerEmail(vendorId);
  const owed = me ? await prisma.referrals.findMany({ where: { referrer_email: me, status: 'owed' }, select: { id: true } }) : [];
  const count = (asFriend ? 1 : 0) + owed.length;
  return { days: Math.min(count, 12) * REFERRAL_DAYS, friendId: asFriend?.id || null, owedIds: owed.map(o => o.id) };
}
/** The trial end a checkout should use, with the referral bonus added on top of any free days carried over. */
export function withBonus(carriedEnd, bonusDays) {
  if (!bonusDays) return carriedEnd;
  return Math.max(carriedEnd || 0, Date.now()) + bonusDays * DAY;
}

/** A completed checkout: the bonus it carried is now given — the friend's month, and any months owed to them. */
export async function settleCheckout(sub) {
  const md = sub?.metadata || {};
  if (md.referral_friend) await prisma.referrals.updateMany({ where: { id: Number(md.referral_friend), friend_rewarded_at: null }, data: { friend_rewarded_at: new Date() } });
  const owed = String(md.referral_owed || '').split(',').map(Number).filter(Boolean);
  if (owed.length) await prisma.referrals.updateMany({ where: { id: { in: owed }, status: 'owed' }, data: { status: 'rewarded', referrer_rewarded_at: new Date(), reward: 'free month at their first checkout' } });
}

/** A friend has really paid: the referrer gets their month — a Stripe credit now, or owed until their own checkout.
 *  Returns the referrer's vendor id when a reward was given or owed, so the caller can tell them. */
export async function rewardReferrer(inv) {
  if (!(inv?.amount_paid > 0)) return null;
  const friend = await prisma.vendors.findFirst({ where: { stripe_customer_id: inv.customer }, select: { id: true } });
  if (!friend) return null;
  const ref = await prisma.referrals.findFirst({ where: { friend_vendor_id: friend.id, status: 'joined', referrer_rewarded_at: null } });
  if (!ref) return null;
  const referrer = await prisma.users.findFirst({ where: { email: { equals: ref.referrer_email, mode: 'insensitive' }, role: 'vendor' }, select: { vendor_id: true } });
  if (!referrer?.vendor_id) return null;
  const paying = await paidSubscription(referrer.vendor_id);
  const cust = (await prisma.vendors.findUnique({ where: { id: referrer.vendor_id }, select: { stripe_customer_id: true } }))?.stripe_customer_id;
  if (paying?.stripe_subscription_id && cust) {
    const s = await stripe('GET', `/subscriptions/${paying.stripe_subscription_id}`);
    const price = s.items?.data?.[0]?.price;
    const month = price?.recurring?.interval === 'year' ? Math.round(price.unit_amount / 12) : price?.unit_amount;
    if (month > 0) {
      await stripe('POST', `/customers/${cust}/balance_transactions`, { amount: -month, currency: price.currency, description: 'iwopo referral: one month free' },
        { idempotencyKey: `referral-credit-${ref.id}` });
      await prisma.referrals.update({ where: { id: ref.id }, data: { status: 'rewarded', referrer_rewarded_at: new Date(), reward: 'one month credit' } });
      return { vendorId: referrer.vendor_id, how: 'credit' };
    }
  }
  await prisma.referrals.update({ where: { id: ref.id }, data: { status: 'owed', reward: 'free month at their first checkout' } });
  return { vendorId: referrer.vendor_id, how: 'owed' };
}

/** A vendor's own referral page: their code (made now if they somehow have none), link, and who joined. */
export async function myReferrals(vendorId, appUrl) {
  let v = await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { referral_code: true, business_name: true } });
  if (!v.referral_code) v = await prisma.vendors.update({ where: { id: Number(vendorId) }, data: { referral_code: await newReferralCode(prisma, v.business_name) }, select: { referral_code: true } });
  const me = await ownerEmail(vendorId);
  const rows = me ? await prisma.referrals.findMany({ where: { referrer_email: me }, orderBy: { id: 'desc' }, select: { friend_email: true, status: true, created_at: true } }) : [];
  return { code: v.referral_code, link: `${appUrl}/?ref=${v.referral_code}`, referrals: rows };
}
