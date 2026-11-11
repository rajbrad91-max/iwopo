import prisma from '../config/prisma.js';
import { trialEnd, annualOf } from './billing.js';
import { usdRate } from './localPrice.js';

/**
 * 📊 Every Super Admin figure, from the database (Raj, 2026-11-05: no invented numbers before launch). The Dashboard,
 * Buyers and Billing screens all read this, so they can never disagree. It follows lib/billing.js's rules:
 *  👑 owner     — vendors.billing_exempt: never billed, never counted as paying
 *  💰 paying    — a Stripe subscription that is active, or past_due (Stripe's payment-retry window, still subscribed)
 *  🎁 trial     — no paid subscription yet (or Stripe's own trial), and the free trial has not ended
 *  ⏸️ expired   — the trial ended without a plan (features paused, nothing deleted)
 * MRR is what each paying subscription is charged (its plan and add-ons, in its own currency, recorded from Stripe —
 * 2026-11-11), turned into US dollars at today's rate; a yearly one counts as a twelfth of its year. A subscription that
 * has not reported its charge yet counts at its plan's US-dollar price. Discounts and tax are not taken off.
 */
const STRIPE_CURRENT = ['active', 'trialing', 'past_due'];
const DAY = 86_400_000;
const round2 = (n) => Math.round(n * 100) / 100;

export async function adminOverview(now = new Date()) {
  const [vendors, subs, plans] = await Promise.all([
    prisma.vendors.findMany({ select: { id: true, billing_exempt: true, trial_ends_at: true, created_at: true } }),
    prisma.vendor_subscriptions.findMany({
      where: { OR: [
        { stripe_subscription_id: { not: null }, status: { in: STRIPE_CURRENT } },
        { stripe_subscription_id: null, status: 'active', OR: [{ ends_at: null }, { ends_at: { gt: now } }] },
      ] },
      select: { id: true, vendor_id: true, plan_id: true, status: true, billing_cycle: true, stripe_subscription_id: true, current_period_end: true, currency: true, amount: true },
      orderBy: { id: 'desc' },
    }),
    prisma.plans.findMany({ select: { id: true, name: true, price_monthly: true, price_annual: true } }),
  ]);
  const planById = new Map(plans.map(p => [p.id, p]));
  const yearly = (s) => /^(annual|year|yearly)$/i.test(String(s.billing_cycle || ''));
  // 💱 today's rate for every currency a subscription is charged in (USD needs none)
  const currencies = [...new Set(subs.map(s => s.currency).filter(c => c && c !== 'USD'))];
  const rates = new Map(await Promise.all(currencies.map(async c => [c, await usdRate(c)])));
  const periodPrice = (s) => {                                     // one billing period's charge, in US dollars
    if (s.amount != null && s.currency && (s.currency === 'USD' || rates.get(s.currency))) {
      return Number(s.amount) / (s.currency === 'USD' ? 1 : rates.get(s.currency));
    }
    const p = planById.get(s.plan_id);                             // not reported yet: the plan's US-dollar price
    if (!p) return 0;
    return yearly(s) ? Number(p.price_annual ?? annualOf(p.price_monthly)) : Number(p.price_monthly);
  };
  const monthlyOf = (s) => (yearly(s) ? periodPrice(s) / 12 : periodPrice(s));

  // each vendor's newest current subscription (the plan they are on), and newest Stripe-backed one (what they pay)
  const onPlan = new Map(), billed = new Map();
  for (const s of subs) {
    if (!onPlan.has(s.vendor_id)) onPlan.set(s.vendor_id, s);
    if (s.stripe_subscription_id && !billed.has(s.vendor_id)) billed.set(s.vendor_id, s);
  }

  const states = {};
  const count = { owner: 0, paying: 0, past_due: 0, trial: 0, expired: 0 };
  let mrr = 0, owed = 0, trialsEndingSoon = 0;
  const byPlan = new Map();                                        // plan id → { paying, mrr }
  for (const v of vendors) {
    const st = billed.get(v.id);
    let state;
    if (v.billing_exempt) state = 'owner';
    else if (st && (st.status === 'active' || st.status === 'past_due')) {
      state = st.status === 'past_due' ? 'past_due' : 'paying';
      const m = monthlyOf(st);
      mrr += m;
      const row = byPlan.get(st.plan_id) || { paying: 0, mrr: 0 };
      row.paying += 1; row.mrr += m; byPlan.set(st.plan_id, row);
      if (state === 'past_due') owed += periodPrice(st);
    } else {
      const ends = st?.status === 'trialing' ? new Date(st.current_period_end || 0) : trialEnd(v);
      state = ends > now ? 'trial' : 'expired';
      if (state === 'trial' && ends - now <= 7 * DAY) trialsEndingSoon += 1;
    }
    states[v.id] = state;
    count[state] += 1;
  }

  // new sellers in each of the last 8 months, this one included
  const growth = [];
  for (let k = 7; k >= 0; k--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    growth.push({
      month: start.toISOString().slice(0, 7),
      label: start.toLocaleString('en', { month: 'short', timeZone: 'UTC' }),
      sellers: vendors.filter(v => v.created_at && v.created_at >= start && v.created_at < end).length,
    });
  }

  // sellers on each plan (whatever they pay), and what each plan brings in
  const onEach = new Map();
  for (const s of onPlan.values()) onEach.set(s.plan_id, (onEach.get(s.plan_id) || 0) + 1);
  return {
    sellers: vendors.length,
    ...count,
    paying_total: count.paying + count.past_due,                   // still subscribed, past due or not
    trials_ending_soon: trialsEndingSoon,
    mrr: round2(mrr), arr: round2(mrr * 12), owed: round2(owed),
    new_this_month: growth[growth.length - 1].sellers,
    growth,
    plans: [
      ...plans.map(p => ({ id: p.id, name: p.name, sellers: onEach.get(p.id) || 0, paying: byPlan.get(p.id)?.paying || 0, mrr: round2(byPlan.get(p.id)?.mrr || 0) })),
      // the sellers on no plan yet, so Plans in Use adds up to every seller (Muse re-test: 31 of 45)
      ...(vendors.length > onPlan.size ? [{ id: 'none', name: 'No plan yet (free trial)', sellers: vendors.length - onPlan.size, paying: 0, mrr: 0 }] : []),
    ],
    states,
  };
}
