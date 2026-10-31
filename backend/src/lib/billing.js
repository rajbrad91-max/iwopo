/**
 * 💳 iwopo billing rules (2026-10-31) — one place that decides who has access and keeps Stripe in step.
 *
 * Access (Raj): a vendor uses their features while (a) they are the owner account (vendors.billing_exempt), or
 * (b) Stripe says their subscription is paid or in its trial (active / trialing / past_due — past_due is Stripe's
 * retry window), or (c) their free trial has not ended (vendors.trial_ends_at, else created_at + TRIAL_DAYS).
 * Otherwise their features pause — nothing is deleted — until they choose a plan.
 *
 * A subscription row only counts beyond the trial when Stripe backs it (stripe_subscription_id): choosing a plan at
 * sign-up used to grant it with no payment at all.
 *
 * Prices: plans.price_monthly / plans.price_annual are the truth (Super Admin). Stripe prices are created from them
 * on demand and found again by lookup key, which carries the amount — change a price and a new Stripe price is made
 * for new subscriptions; existing subscribers keep theirs until moved.
 */
import prisma from '../config/prisma.js';
import { stripe } from './stripe.js';

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 30);
export const ANNUAL_DISCOUNT = 0.20;                          // Raj: yearly = 20% off
const PAID = new Set(['active', 'trialing', 'past_due']);
const DAY = 86_400_000;

/**
 * Which subscription rows count as "the plan a vendor is on": one Stripe backs (active, in Stripe's trial, or in its
 * payment-retry window), or one without Stripe (picked at sign-up, or set by Super Admin) that has not ended.
 * Whether the vendor may use it at all is billingAccess()'s question; this is only "which plan".
 */
export const currentSubscriptionWhere = (vendorId, now = new Date()) => ({
  vendor_id: Number(vendorId),                                // 🔒 tenancy
  OR: [
    { stripe_subscription_id: { not: null }, status: { in: [...PAID] } },
    { stripe_subscription_id: null, status: 'active', OR: [{ ends_at: null }, { ends_at: { gt: now } }] },
  ],
});

export const trialEnd = (v) => (v?.trial_ends_at ? new Date(v.trial_ends_at) : new Date(new Date(v?.created_at || Date.now()).getTime() + TRIAL_DAYS * DAY));
export const annualOf = (monthly) => Math.round(Number(monthly) * 12 * (1 - ANNUAL_DISCOUNT) * 100) / 100;

/** The Stripe-backed subscription that counts, if any. */
export async function paidSubscription(vendorId) {
  return prisma.vendor_subscriptions.findFirst({
    where: { vendor_id: Number(vendorId), stripe_subscription_id: { not: null }, status: { in: [...PAID] } },   // 🔒
    orderBy: { id: 'desc' },
    select: { id: true, plan_id: true, status: true, billing_cycle: true, current_period_end: true, cancel_at_period_end: true, stripe_subscription_id: true },
  });
}

/** { allowed, reason: 'owner' | 'paid' | 'trial' | 'expired', trialEndsAt } */
export async function billingAccess(vendorId) {
  const v = await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { billing_exempt: true, trial_ends_at: true, created_at: true } });
  if (!v) return { allowed: false, reason: 'expired', trialEndsAt: null };
  const ends = trialEnd(v);
  if (v.billing_exempt) return { allowed: true, reason: 'owner', trialEndsAt: ends };
  if (await paidSubscription(vendorId)) return { allowed: true, reason: 'paid', trialEndsAt: ends };
  if (ends > new Date()) return { allowed: true, reason: 'trial', trialEndsAt: ends };
  return { allowed: false, reason: 'expired', trialEndsAt: ends };
}

/** The Stripe price for a plan and cycle, created once per amount and found again by its lookup key. */
export async function stripePriceFor(plan, cycle) {
  const amount = cycle === 'annual' ? Number(plan.price_annual ?? annualOf(plan.price_monthly)) : Number(plan.price_monthly);
  const cents = Math.round(amount * 100);
  if (!(cents > 0)) throw new Error('This plan has no price yet.');
  const lookup = `iwopo_${plan.code}_${cycle}_${cents}`;
  const found = await stripe('GET', '/prices', { lookup_keys: [lookup], active: true, limit: 1 });
  if (found.data?.[0]) return found.data[0].id;
  let productId = plan.stripe_product_id;
  if (!productId) {
    const product = await stripe('POST', '/products', { name: `iwopo ${plan.name}`, metadata: { plan_id: plan.id, plan_code: plan.code } }, { idempotencyKey: `product-${plan.code}` });
    productId = product.id;
    await prisma.plans.update({ where: { id: plan.id }, data: { stripe_product_id: productId } });
  }
  const price = await stripe('POST', '/prices', {
    product: productId, currency: 'usd', unit_amount: cents, lookup_key: lookup, transfer_lookup_key: true,
    recurring: { interval: cycle === 'annual' ? 'year' : 'month' }, metadata: { plan_id: plan.id, cycle },
  }, { idempotencyKey: `price-${lookup}` });
  return price.id;
}

/** The Stripe customer for a vendor, created once and remembered on the vendor. */
export async function stripeCustomerFor(vendorId) {
  const v = await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { id: true, business_name: true, stripe_customer_id: true } });
  if (v.stripe_customer_id) return v.stripe_customer_id;
  const owner = await prisma.users.findFirst({ where: { vendor_id: v.id, role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true } });
  const c = await stripe('POST', '/customers', { name: v.business_name, email: owner?.email || undefined, metadata: { vendor_id: v.id } }, { idempotencyKey: `customer-${v.id}` });
  await prisma.vendors.update({ where: { id: v.id }, data: { stripe_customer_id: c.id } });
  return c.id;
}

/**
 * Record what Stripe says about a subscription (from a webhook or a lookup): which plan, which cycle, its status and
 * period — and move the vendor's own status with it (trial while Stripe's trial runs, active once paying, expired
 * when it ends). One row per Stripe subscription.
 */
export async function recordSubscription(sub) {
  const vendorId = Number(sub.metadata?.vendor_id) || (await prisma.vendors.findFirst({ where: { stripe_customer_id: String(sub.customer) }, select: { id: true } }))?.id;
  if (!vendorId) return null;
  const item = sub.items?.data?.[0];
  const planId = Number(item?.price?.metadata?.plan_id || sub.metadata?.plan_id) || null;
  const plan = planId ? await prisma.plans.findUnique({ where: { id: planId }, select: { id: true } }) : null;
  if (!plan) return null;
  // Stripe's newer API versions (what webhooks arrive in) keep the period on the item, older ones on the subscription;
  // during a trial the trial end is the next billing date either way
  const periodEnd = sub.current_period_end || item?.current_period_end || sub.trial_end || null;
  const data = {
    vendor_id: vendorId, plan_id: plan.id, status: sub.status,
    billing_cycle: item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
    current_period_end: periodEnd ? new Date(periodEnd * 1000) : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    ends_at: sub.ended_at ? new Date(sub.ended_at * 1000) : null,
  };
  const row = await prisma.vendor_subscriptions.findFirst({ where: { stripe_subscription_id: sub.id }, select: { id: true } });
  if (row) await prisma.vendor_subscriptions.update({ where: { id: row.id }, data });
  else {
    // the sign-up row (no Stripe id) has done its job — the paid subscription takes over
    await prisma.vendor_subscriptions.updateMany({ where: { vendor_id: vendorId, stripe_subscription_id: null, status: 'active' }, data: { status: 'replaced', ends_at: new Date() } });
    await prisma.vendor_subscriptions.create({ data: { ...data, stripe_subscription_id: sub.id, started_at: new Date() } });
  }
  const vendorStatus = sub.status === 'trialing' ? 'trial' : PAID.has(sub.status) ? 'active' : 'expired';
  const v = await prisma.vendors.findUnique({ where: { id: vendorId }, select: { billing_exempt: true } });
  if (!v.billing_exempt) await prisma.vendors.update({ where: { id: vendorId }, data: { status: vendorStatus } });
  return { vendorId, status: sub.status };
}
