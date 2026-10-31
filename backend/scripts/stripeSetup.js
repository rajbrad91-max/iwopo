/**
 * 💳 Stripe setup for this environment (2026-10-31) — safe to run again at any time.
 *
 *   cd backend && node scripts/stripeSetup.js
 *
 *   1. a Stripe price for every plan, monthly and yearly (from the database — Super Admin's prices)
 *   2. the billing-portal configuration (card, plan and monthly↔yearly switches, cancel at period end, invoices),
 *      remembered in platform_settings 'stripe_portal_config'
 *   3. the webhook endpoint <APP_URL>/api/billing/webhook — created once; its signing secret is written straight into
 *      this environment's .env as STRIPE_WEBHOOK_SECRET (never printed)
 * Re-running after a price change makes the new prices and refreshes the portal's plan list.
 */
import 'dotenv/config';
import fs from 'node:fs';
import prisma from '../src/config/prisma.js';
import { stripe, stripeReady, stripeMode } from '../src/lib/stripe.js';
import { stripePriceFor } from '../src/lib/billing.js';

const APP_URL = (process.env.APP_URL || 'https://iwopo.com').replace(/\/+$/, '');
const HOOK_URL = `${APP_URL}/api/billing/webhook`;
const EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'];

if (!stripeReady()) { console.log('No STRIPE_SECRET_KEY — nothing to do.'); process.exit(0); }
console.log(`Stripe ${stripeMode()} mode · ${APP_URL}`);

// 1 · prices
const plans = await prisma.plans.findMany({ orderBy: { price_monthly: 'asc' } });
const products = [];
for (const p of plans) {
  if (!(Number(p.price_monthly) > 0)) { console.log(`  skip ${p.name} (no price)`); continue; }
  const monthly = await stripePriceFor(p, 'monthly');
  const annual = await stripePriceFor(p, 'annual');
  const fresh = await prisma.plans.findUnique({ where: { id: p.id }, select: { stripe_product_id: true } });
  products.push({ product: fresh.stripe_product_id, prices: [monthly, annual] });
  console.log(`  ${p.name}: monthly + yearly prices ready`);
}

// 2 · billing portal
const portalParams = {
  business_profile: { headline: 'Manage your iwopo plan' },
  features: {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: { enabled: products.length > 0, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products },
  },
};
const saved = await prisma.platform_settings.findUnique({ where: { key: 'stripe_portal_config' }, select: { value: true } });
let configId = saved?.value;
if (configId) await stripe('POST', `/billing_portal/configurations/${configId}`, portalParams).catch(() => { configId = null; });
if (!configId) configId = (await stripe('POST', '/billing_portal/configurations', portalParams)).id;
await prisma.platform_settings.upsert({ where: { key: 'stripe_portal_config' }, update: { value: configId }, create: { key: 'stripe_portal_config', value: configId } });
console.log('  billing portal ready');

// 3 · webhook (created once; the secret only exists at creation, so it goes straight into .env)
const hooks = await stripe('GET', '/webhook_endpoints', { limit: 100 });
const existing = hooks.data.find(h => h.url === HOOK_URL);
if (existing && /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || '')) {
  await stripe('POST', `/webhook_endpoints/${existing.id}`, { enabled_events: EVENTS });
  console.log('  webhook ready (existing)');
} else {
  if (existing) await stripe('DELETE', `/webhook_endpoints/${existing.id}`);
  const hook = await stripe('POST', '/webhook_endpoints', { url: HOOK_URL, enabled_events: EVENTS, description: 'iwopo billing' });
  const envFile = new URL('../.env', import.meta.url);
  const lines = fs.readFileSync(envFile, 'utf8').split('\n').filter(l => !l.startsWith('STRIPE_WEBHOOK_SECRET='));
  if (lines[lines.length - 1] === '') lines.pop();
  fs.writeFileSync(envFile, lines.join('\n') + `\nSTRIPE_WEBHOOK_SECRET=${hook.secret}\n`);
  console.log('  webhook created — signing secret saved to .env (restart the API to load it)');
}
await prisma.$disconnect();
