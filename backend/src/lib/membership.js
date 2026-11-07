import prisma from '../config/prisma.js';
import { stripe } from './stripe.js';
import { paidSubscription, recordSubscription } from './billing.js';

/**
 * ⏸️ A vendor's membership, as Super Admin manages it (Raj, 2026-11-07). Stopping a membership is not deleting an
 * account: the account, its data and its contact stay, so the vendor can come back — and, if they agreed to offers,
 * be invited back. Deleting removes everything (lib/deleteVendor.js).
 */
const periodEnd = (s) => s?.current_period_end ?? s?.items?.data?.[0]?.current_period_end ?? null;   // by Stripe API version

export async function membershipOf(vendorId) {
  const sub = await paidSubscription(vendorId);
  const v = await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { marketing_opt_in: true, marketing_opt_in_at: true } });
  const owner = await prisma.users.findFirst({ where: { vendor_id: Number(vendorId), role: 'vendor' }, orderBy: { id: 'asc' }, select: { terms_accepted_at: true, terms_version: true } });
  const base = { marketing_opt_in: !!v?.marketing_opt_in, marketing_opt_in_at: v?.marketing_opt_in_at || null,
    terms_accepted_at: owner?.terms_accepted_at || null, terms_version: owner?.terms_version || null };   // 📜
  if (!sub?.stripe_subscription_id) return { ...base, paying: false };
  const s = await stripe('GET', `/subscriptions/${sub.stripe_subscription_id}`);
  const plan = await prisma.plans.findUnique({ where: { id: sub.plan_id }, select: { name: true } });
  const end = periodEnd(s);
  return { ...base, paying: true, plan: plan?.name || null, cycle: sub.billing_cycle || null, status: s.status,
    stopping: !!s.cancel_at_period_end, period_end: end ? new Date(end * 1000) : null };
}

/** when: 'period_end' (keeps what they paid for, then stops) · 'now' (stops today, no refund) · 'resume' (undo period_end) */
export async function changeMembership(vendorId, when) {
  const sub = await paidSubscription(vendorId);
  if (!sub?.stripe_subscription_id) throw Object.assign(new Error('This vendor has no paid membership to change.'), { status: 409 });
  const id = sub.stripe_subscription_id;
  const s = when === 'now' ? await stripe('DELETE', `/subscriptions/${id}`)
    : when === 'period_end' ? await stripe('POST', `/subscriptions/${id}`, { cancel_at_period_end: true })
    : when === 'resume' ? await stripe('POST', `/subscriptions/${id}`, { cancel_at_period_end: false })
    : null;
  if (!s) throw Object.assign(new Error('Unknown change.'), { status: 400 });
  await recordSubscription(s);
  return membershipOf(vendorId);
}

/** 👋 Everyone who paid and has stopped, or is stopping — the people a win-back offer would go to. */
export async function formerSubscribers() {
  const rows = await prisma.vendor_subscriptions.findMany({
    where: { stripe_subscription_id: { not: null }, OR: [{ status: { in: ['canceled', 'cancelled', 'unpaid', 'incomplete_expired'] } }, { cancel_at_period_end: true }], vendors: { billing_exempt: false } },
    orderBy: { id: 'desc' },
    select: { vendor_id: true, status: true, cancel_at_period_end: true, ends_at: true, plans: { select: { name: true } },
      vendors: { select: { business_name: true, marketing_opt_in: true, users: { where: { role: 'vendor' }, orderBy: { id: 'asc' }, take: 1, select: { email: true, name: true } } } } },
  });
  const seen = new Set(); const out = [];
  for (const r of rows) {
    if (seen.has(r.vendor_id)) continue; seen.add(r.vendor_id);
    if (await paidSubscription(r.vendor_id) && !r.cancel_at_period_end) continue;   // came back and paying again
    out.push({ vendor_id: r.vendor_id, business_name: r.vendors?.business_name, name: r.vendors?.users?.[0]?.name || null, email: r.vendors?.users?.[0]?.email || null,
      plan: r.plans?.name || null, state: r.cancel_at_period_end && r.status !== 'canceled' ? 'stopping' : 'ended', ended_at: r.ends_at, offers: !!r.vendors?.marketing_opt_in });
  }
  return out;
}
