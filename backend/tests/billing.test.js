/**
 * 💳 Checkout (2026-11-11): what a vendor is shown on Plans & Upgrades is exactly what Stripe is asked to charge, in
 * their country's currency. Runs only with Stripe in TEST mode; the checkout sessions it opens are expired at once.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging, tokens, call, asCountry } from './helpers.js';

staging();
const { stripe, stripeMode } = await import('../src/lib/stripe.js');
after(() => prisma.$disconnect());
const t = await tokens();
const essential = await prisma.plans.findFirst({ where: { code: 'essential' } });
const testMode = stripeMode() === 'test';

for (const [country, currency, amount, conversion] of [['CA-BC', 'cad', 2500, false], ['IN', 'inr', 69900, false], ['PK', 'usd', 1200, true], ['US', 'usd', 1900, true]]) {
  test(`${country}: shown ${currency.toUpperCase()} ${amount / 100}, and Stripe is asked for exactly that`, { skip: !testMode && 'Stripe is not in test mode' }, async () => {
    await asCountry(country, async () => {
      const shown = (await call('GET', '/billing', { token: t.vendor })).body;
      const e = shown.table.plans.find(p => p.code === 'essential');
      const shownCents = Math.round((e.local ? e.local.monthly : e.price_monthly) * 100);
      assert.equal(shownCents, amount, 'Plans & Upgrades');
      const r = await call('POST', '/billing/checkout', { token: t.vendor, body: { plan_id: essential.id, cycle: 'monthly' } });
      const id = r.body?.url?.match(/cs_test_[A-Za-z0-9]+/)?.[0];
      assert.ok(id, `a checkout session (${JSON.stringify(r.body).slice(0, 80)})`);
      try {
        const s = await stripe('GET', `/checkout/sessions/${id}`, { 'expand[]': 'line_items' });
        const price = s.line_items.data[0].price;
        assert.equal(price.currency, currency);
        assert.equal(price.unit_amount, amount);
        assert.equal(!!s.adaptive_pricing?.enabled, conversion, 'Stripe currency conversion only for US dollars');
      } finally { await stripe('POST', `/checkout/sessions/${id}/expire`).catch(() => {}); }
    });
  });
}

test('the public pricing table answers with its plans and rows', async () => {
  const r = await call('GET', '/packages');
  assert.equal(r.status, 200);
  assert.ok(r.body.packages.length > 0 && r.body.compare.length > 0);
});
