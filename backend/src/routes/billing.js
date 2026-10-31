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
import { billingAccess, paidSubscription, stripePriceFor, stripeCustomerFor, recordSubscription, annualOf, trialEnd } from '../lib/billing.js';
import { forgetHosts } from '../lib/vendorHosts.js';
import { notify } from './notifications.js';

const APP_URL = (process.env.APP_URL || 'https://iwopo.com').replace(/\/+$/, '');
const DAY = 86_400_000;

/* ── Stripe → iwopo (raw body; exported separately so server.js can mount it before the JSON parser) ── */
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
      const r = await recordSubscription(await stripe('GET', `/subscriptions/${o.subscription}`));
      if (r) notify(r.vendorId, '🎉 Your plan is set up', 'Thank you — your iwopo subscription is in place', 'plans', { type: 'plans' });
    } else if (event.type === 'invoice.payment_failed' && o.subscription) {
      const r = await recordSubscription(await stripe('GET', `/subscriptions/${o.subscription}`));
      if (r) notify(r.vendorId, '⚠️ Your iwopo payment didn’t go through', 'Please update your card in Plans → Manage billing', 'plans', { type: 'plans' });
    } else if (event.type === 'invoice.paid' && o.subscription) {
      await recordSubscription(await stripe('GET', `/subscriptions/${o.subscription}`));
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
      prisma.plans.findMany({ orderBy: { price_monthly: 'asc' }, select: { id: true, code: true, name: true, price_monthly: true, price_annual: true, storage_gb: true, plan_features: { select: { feature_key: true } } } }),
    ]);
    const daysLeft = access.trialEndsAt ? Math.max(0, Math.ceil((access.trialEndsAt - Date.now()) / DAY)) : 0;
    res.json({
      ready: stripeReady(),
      state: access.reason,                              // owner | paid | trial | expired
      trial_ends_at: access.trialEndsAt, trial_days_left: access.reason === 'trial' ? daysLeft : 0,
      subscription: sub ? { plan_id: sub.plan_id, status: sub.status, cycle: sub.billing_cycle, renews_at: sub.current_period_end, cancels: sub.cancel_at_period_end } : null,
      plans: plans.map(p => ({
        id: p.id, code: p.code, name: p.name, storage_gb: p.storage_gb,
        monthly: Number(p.price_monthly), annual: Number(p.price_annual ?? annualOf(p.price_monthly)),
        features: p.plan_features.map(f => f.feature_key).filter(k => k !== 'custom_domain'),
        own_domain: p.plan_features.some(f => f.feature_key === 'custom_domain'),
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const plan = await prisma.plans.findUnique({ where: { id: Number(req.body?.plan_id) } });
    if (!plan) return res.status(404).json({ error: 'That plan does not exist.' });
    const cycle = req.body?.cycle === 'annual' ? 'annual' : 'monthly';
    const price = await stripePriceFor(plan, cycle);
    // the free trial carries over: billing starts when it ends (Stripe needs at least 48 hours to schedule that)
    const ends = trialEnd(vendor).getTime();
    const trial_end = ends - Date.now() > 2 * DAY ? Math.floor(ends / 1000) : undefined;
    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'subscription', customer, client_reference_id: v,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { trial_end, metadata: { vendor_id: v, plan_id: plan.id, cycle } },
      metadata: { vendor_id: v, plan_id: plan.id, cycle },
      allow_promotion_codes: true,
      // ⚖️ what they agree to, said where they pay (pages: /terms, /refund-policy)
      custom_text: { submit: { message: `By subscribing you agree to iwopo’s Terms of Service (${APP_URL}/terms). Cancel any time in Manage billing; payments are not refunded (${APP_URL}/refund-policy).` } },
      success_url: `${APP_URL}/panel/plans?billing=done`,
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
