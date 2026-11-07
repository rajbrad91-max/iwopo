/**
 * 💳 /api/billing — choose a plan, pay with Stripe, manage it (2026-10-31).
 *
 *   GET  /api/billing           where this vendor stands: owner / trial (days left) / paid / expired, the plans with
 *                                monthly and yearly prices, and what they are on
 *   POST /api/billing/checkout  { plan_id, cycle } → a Stripe Checkout link. Billing starts when their free trial
 *                                ends, so paying early never costs free days. Already subscribed → the billing portal.
 *   POST /api/billing/portal    → Stripe's billing portal (card, monthly ↔ yearly, plan, cancel, invoices)
 *   POST /api/billing/webhook   Stripe → iwopo, signature-checked over the raw body (mounted before express.json)
 *
 * The vendor is always the one in the token; amounts always come from the database, never from the request.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { stripe, stripeReady, verifyWebhook } from '../lib/stripe.js';
import { billingAccess, paidSubscription, stripePriceFor, stripeCustomerFor, recordSubscription, annualOf, carriedTrialEnd, currentPlan } from '../lib/billing.js';
import { forgetHosts } from '../lib/vendorHosts.js';
import { notify } from './notifications.js';
import { serverError } from '../lib/httpError.js';
import { planCards } from '../lib/planCatalog.js';
import { addonsFor, addAddon, removeAddon } from '../lib/addons.js';
import { visitorCurrency } from '../lib/localPrice.js';
import { emailInvoice, invoiceSubscription } from '../lib/billingEmails.js';
import { referralBonus, withBonus, settleCheckout, rewardReferrer } from '../lib/referrals.js';

const APP_URL = (process.env.APP_URL || 'https://iwopo.com').replace(/\/+$/, '');
const DAY = 86_400_000;

/* ── Stripe → iwopo (raw body; exported separately so server.js can mount it before the JSON parser) ── */
/** 💳 The plan a vendor chose at sign-up and has not paid for yet — what the panel's "finish your payment" line offers */
async function pendingPlan(v) {
  const x = await prisma.vendors.findUnique({ where: { id: v }, select: { pending_plan_id: true, pending_cycle: true } });
  if (!x?.pending_plan_id || await paidSubscription(v)) return null;
  const p = await prisma.plans.findUnique({ where: { id: x.pending_plan_id }, select: { id: true, name: true } });
  return p ? { id: p.id, name: p.name, cycle: x.pending_cycle || 'monthly' } : null;
}

/** 👋 { plan } when a paying vendor has not yet seen the getting-started steps — else null */
async function welcomeDue(v, sub) {
  const x = await prisma.vendors.findUnique({ where: { id: v }, select: { welcome_seen_at: true, billing_exempt: true } });
  if (!x || x.welcome_seen_at || x.billing_exempt) return null;
  const p = await prisma.plans.findUnique({ where: { id: sub.plan_id }, select: { name: true } });
  return { plan: p?.name || 'your plan' };
}

export const billingWebhook = express.Router();
billingWebhook.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const event = verifyWebhook(req.body?.toString('utf8') || '', req.headers['stripe-signature']);
  if (!event) return res.status(400).send('bad signature');
  try {
    const o = event.data?.object || {};
    if (event.type.startsWith('customer.subscription.')) {
      const r = await recordSubscription(o);
      if (r && event.type === 'customer.subscription.deleted') notify(r.vendorId, '💳 Your iwopo plan has ended', 'Choose a plan to switch your features back on — your data is safe', 'plans', { type: 'plans' });
    } else if (event.type === 'checkout.session.completed' && o.subscription) {
      const s = await stripe('GET', `/subscriptions/${o.subscription}`);
      const r = await recordSubscription(s);
      await settleCheckout(s).catch(e => console.warn('[referral settle]', e.message));   // 🎁 the bonus it carried is given
      if (r) await prisma.vendors.update({ where: { id: r.vendorId }, data: { pending_plan_id: null, pending_cycle: null } });   // 💳 paid: nothing waiting
      if (r) notify(r.vendorId, '🎉 Your plan is set up', 'Thank you — your iwopo subscription is in place', 'plans', { type: 'plans' });
    } else if (event.type === 'invoice.payment_failed' && invoiceSubscription(o)) {
      const r = await recordSubscription(await stripe('GET', `/subscriptions/${invoiceSubscription(o)}`));
      if (r) notify(r.vendorId, '⚠️ Your iwopo payment didn’t go through', 'Please update your card in Plans → Manage billing', 'plans', { type: 'plans' });
    } else if (event.type === 'invoice.paid' && invoiceSubscription(o)) {
      await recordSubscription(await stripe('GET', `/subscriptions/${invoiceSubscription(o)}`));
      // ✉️ the plan-active email / receipt, from noreply@iwopo.com — a mail hiccup never fails the webhook
      await emailInvoice(o).catch(e => console.warn('[billing email]', o.id, e.message));
      // 🎁 a referred friend really paid: their referrer gets a month (credit now, or owed)
      const rw = await rewardReferrer(o).catch(e => { console.warn('[referral reward]', o.id, e.message); return null; });
      if (rw) notify(rw.vendorId, '🎁 A friend you referred has joined', rw.how === 'credit' ? 'You get one month free — it comes off your next bill' : 'You get one month free — it starts when you choose a plan', 'plans', { type: 'plans' });
    }
    forgetHosts();                                      // plan changes move own-domain and branding rights
    res.json({ received: true });
  } catch (e) {
    console.error('[billing webhook]', event.type, e.message);
    res.status(500).json({ error: 'retry' });           // Stripe retries a 5xx
  }
});

/* ── the vendor's side ── */
const router = express.Router();
router.use(requireAuth);
const vendorOf = (req) => Number(req.user.vendor_id) || null;      // 🔒 from the token, never the request

router.get('/', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    const [access, sub, plans] = await Promise.all([
      billingAccess(v), paidSubscription(v),
      planCards({ currency: visitorCurrency(req) }),
    ]);
    const daysLeft = access.trialEndsAt ? Math.max(0, Math.floor((access.trialEndsAt - Date.now()) / DAY)) : 0;   // whole days, as Stripe counts
    res.json({
      marketing_opt_in: !!(await prisma.vendors.findUnique({ where: { id: v }, select: { marketing_opt_in: true } }))?.marketing_opt_in,   // 📬
      pending_plan: await pendingPlan(v),   // 💳 chosen at sign-up, not yet paid
      welcome: sub ? await welcomeDue(v, sub) : null,   // 👋 the getting-started steps, once after paying
      ready: stripeReady(),
      state: access.reason,                              // owner | paid | trial | expired
      trial_ends_at: access.trialEndsAt, trial_days_left: access.reason === 'trial' ? daysLeft : 0,
      subscription: sub ? { plan_id: sub.plan_id, status: sub.status, cycle: sub.billing_cycle, renews_at: sub.current_period_end, cancels: sub.cancel_at_period_end } : null,
      current_plan: await currentPlan(v).then(c => ({ code: c.plan?.code, name: c.plan?.name, reason: c.reason })),
      addons: await addonsFor(v, { currency: visitorCurrency(req) }),
      // the paid plans as cards (Free is where an unpaid account rests, never something to check out)
      plans: plans.filter(p => p.price_monthly > 0).map(p => ({
        id: p.id, code: p.code, name: p.name, icon: p.icon, tagline: p.tagline, storage_gb: p.storage_gb,
        monthly: p.price_monthly, annual: p.price_annual || annualOf(p.price_monthly), lines: p.lines, local: p.local,
      })),
    });
  } catch (e) { serverError(res, e); }
});

/* 👋 The getting-started steps were seen — they open once, after the first payment */
router.post('/welcome-seen', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try { await prisma.vendors.update({ where: { id: v }, data: { welcome_seen_at: new Date() } }); res.json({ ok: true }); }
  catch (e) { serverError(res, e); }
});

/* 📬 The vendor's own switch for offers and news from iwopo (Raj, 2026-11-07) — consent they can take back any time */
router.post('/marketing', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    const on = req.body?.on === true;
    await prisma.vendors.update({ where: { id: v }, data: { marketing_opt_in: on, marketing_opt_in_at: on ? new Date() : null } });
    res.json({ marketing_opt_in: on });
  } catch (e) { serverError(res, e); }
});

/* 🔁 Auto-renew on or off (Raj, 2026-11-06). Off: the plan simply ends when the paid period does — no refund, no
   reminder; everything keeps working until then. On again: it renews as before. Stripe holds the switch. */
router.post('/auto-renew', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    const sub = await paidSubscription(v);
    if (!sub?.stripe_subscription_id) return res.status(409).json({ error: 'There is no paid plan to renew.' });
    const s = await stripe('POST', `/subscriptions/${sub.stripe_subscription_id}`, { cancel_at_period_end: !req.body?.on });
    await recordSubscription(s);
    res.json({ auto_renew: !s.cancel_at_period_end });
  } catch (e) { serverError(res, e); }
});

/* ➕ add-ons: a paying vendor adds one (charged the difference now) or removes it (from the next bill) — lib/addons.js */
router.post('/addons/:id', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    if (!stripeReady()) return res.status(503).json({ error: 'Payments are being set up — please try again soon.' });
    res.json({ addon: await addAddon(v, req.params.id) });
  } catch (e) { res.status(e.status && e.status < 500 ? e.status : 500).json({ error: e.status ? e.message : 'Could not add it — please try again.' }); }
});
router.delete('/addons/:id', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try { res.json({ addon: await removeAddon(v, req.params.id) }); }
  catch (e) { serverError(res, e); }
});

router.post('/checkout', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    if (!stripeReady()) return res.status(503).json({ error: 'Payments are being set up — please try again soon.' });
    const vendor = await prisma.vendors.findUnique({ where: { id: v }, select: { billing_exempt: true, trial_ends_at: true, created_at: true } });
    if (vendor.billing_exempt) return res.status(400).json({ error: 'This account is never billed.' });
    const customer = await stripeCustomerFor(v);
    if (await paidSubscription(v)) {                      // already subscribed: plan and cycle changes live in the portal
      const portal = await stripe('POST', '/billing_portal/sessions', { customer, return_url: `${APP_URL}/panel/plans` });
      return res.json({ url: portal.url });
    }
    // 💳 no plan named: the one they chose at sign-up (confirmed by the email's button, or on another device)
    const pend = req.body?.plan_id ? null : await prisma.vendors.findUnique({ where: { id: v }, select: { pending_plan_id: true, pending_cycle: true } });
    const plan = await prisma.plans.findUnique({ where: { id: Number(req.body?.plan_id || pend?.pending_plan_id || 0) } });
    if (!plan) return res.status(404).json({ error: 'Choose a plan first.' });
    const cycle = (req.body?.cycle || pend?.pending_cycle) === 'annual' ? 'annual' : 'monthly';
    const price = await stripePriceFor(plan, cycle);
    // 🧪 the free trial carries over — capped by the chosen plan's own trial days; Studio (0) is charged from day one.
    //    Stripe needs at least 48 hours to schedule a trial end.
    const carried = carriedTrialEnd(vendor, plan);
    // 🎁 a referral's free month(s) go on top (lib/referrals.js)
    const bonus = await referralBonus(v);
    const ends = withBonus(carried && carried - Date.now() > 2 * DAY ? carried : null, bonus.days);
    const trial_end = ends && ends - Date.now() > 2 * DAY ? Math.floor(ends / 1000) : undefined;
    const refMeta = { ...(bonus.friendId ? { referral_friend: bonus.friendId } : {}), ...(bonus.owedIds.length ? { referral_owed: bonus.owedIds.join(',') } : {}) };
    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'subscription', customer, client_reference_id: v,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { trial_end, metadata: { vendor_id: v, plan_id: plan.id, cycle, ...refMeta } },
      metadata: { vendor_id: v, plan_id: plan.id, cycle },
      allow_promotion_codes: true,
      // 🌍 charged in the subscriber's own currency (Stripe Adaptive Pricing — Raj, 2026-11-06); iwopo is paid in USD
      adaptive_pricing: { enabled: true },
      // ⚖️ what they agree to, said where they pay (pages: /terms, /refund-policy)
      custom_text: { submit: { message: `By subscribing you agree to iwopo’s Terms of Service (${APP_URL}/terms). Cancel any time in Manage billing; payments are not refunded (${APP_URL}/refund-policy).` } },
      success_url: `${APP_URL}/panel?billing=done`,   // 👋 the dashboard, where the getting-started steps open
      cancel_url: `${APP_URL}/panel/plans?billing=cancelled`,
    });
    res.json({ url: session.url });
  } catch (e) { res.status(e.status && e.status < 500 ? 400 : 500).json({ error: e.message }); }
});

router.post('/portal', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    if (!stripeReady()) return res.status(503).json({ error: 'Payments are being set up — please try again soon.' });
    const config = await prisma.platform_settings.findUnique({ where: { key: 'stripe_portal_config' }, select: { value: true } });
    const portal = await stripe('POST', '/billing_portal/sessions', {
      customer: await stripeCustomerFor(v), return_url: `${APP_URL}/panel/plans`, configuration: config?.value || undefined,
    });
    res.json({ url: portal.url });
  } catch (e) { serverError(res, e); }
});

export default router;
