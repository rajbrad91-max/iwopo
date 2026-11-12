/**
 * 💱 Prices (Raj, 2026-11-10/11): the rules behind the fixed local prices, checked against the database itself — so a
 * price edited later in Super Admin that breaks a rule fails here before it can go live.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging } from './helpers.js';

staging();
const { countryCode, fixedPricesFor, addonPricesFor, addonPriceForSubscription } = await import('../src/lib/regionalPrice.js');
const { planCompare } = await import('../src/lib/planCatalog.js');
const { subscriptionCharge } = await import('../src/lib/billing.js');
const { usdRate } = await import('../src/lib/localPrice.js');
after(() => prisma.$disconnect());

const regions = await prisma.price_regions.findMany({ include: { plan_region_prices: true, addon_region_prices: true } });
const plans = await prisma.plans.findMany({ where: { price_monthly: { gt: 0 } }, orderBy: { sort_order: 'asc' } });
const storage = await prisma.services.findMany({ where: { is_addon: true, storage_gb: { gt: 0 } }, orderBy: { storage_gb: 'asc' } });
const byCode = Object.fromEntries(plans.map(p => [p.code, p]));

test('a vendor’s country is read the way it is stored', () => {
  assert.equal(countryCode('CA-BC'), 'CA');
  assert.equal(countryCode('pk'), 'PK');
  assert.equal(countryCode(''), null);
  assert.equal(countryCode('Canada'), null);
});

test('every country in a territory is shown that territory’s fixed plan prices; others the USD prices', async () => {
  for (const r of regions.filter(x => x.code !== 'USD')) {
    const { plans: shown } = await planCompare({ country: r.countries[0] });
    for (const row of r.plan_region_prices) {
      const p = shown.find(x => x.id === row.plan_id);
      assert.equal(p.local?.currency, r.currency, `${r.code} ${p.code} currency`);
      assert.equal(p.local.monthly, Number(row.monthly), `${r.code} ${p.code} monthly`);
    }
  }
  for (const c of ['US', 'JP', null]) {
    const { plans: shown } = await planCompare({ country: c });
    assert.ok(shown.every(p => !p.local), `${c}: the plans’ own USD prices`);
  }
});

test('in every territory each higher plan costs more', () => {
  for (const r of regions.filter(x => x.code !== 'USD')) {
    const m = (code) => Number(r.plan_region_prices.find(x => x.plan_id === byCode[code].id).monthly);
    assert.ok(m('essential') < m('pro') && m('pro') < m('studio'), r.code);
  }
});

test('storage add-ons are never sold at a loss: 20% cushion with the storage 100% full, monthly and yearly', async () => {
  const cost = (gb) => gb * 0.015 + 0.10 + 0.0007 * gb;            // R2 storage full, plus operations, a month
  const check = (label, gb, monthly, annual, rate, domestic) => {
    const pct = 0.041 + (domestic ? 0 : 0.025);                      // Stripe, Billing, Tax (+ international card, conversion)
    for (const [cyc, rev, n] of [['monthly', monthly / rate, 1], ['yearly', annual / rate / 12, 12]]) {
      const room = 1 - (cost(gb) + 0.30 / n) / (1 - pct) / rev;
      assert.ok(room >= 0.199, `${label} ${gb} GB ${cyc}: only ${(room * 100).toFixed(1)}% cushion`);
    }
  };
  for (const s of storage) check('USD', s.storage_gb, Number(s.price), Number(s.price_annual), 1, true);
  for (const r of regions.filter(x => x.code !== 'USD')) {
    const rate = r.currency === 'USD' ? 1 : await usdRate(r.currency);
    for (const s of storage) {
      const a = r.addon_region_prices.find(x => x.service_id === s.id && x.plan_code === '');
      check(r.code, s.storage_gb, Number(a.monthly), Number(a.annual), rate, false);
    }
  }
});

test('Pro + 500 GB stays cheaper than Studio', async () => {
  // Raj, 2026-11-12: Studio's monthly price went up so yearly saves ~17%; the old "Pro + 1 TB never below Studio" rule
  // was retired with it, by his choice. Pro + 500 GB stays the cheaper step up.
  const half = storage.find(s => s.storage_gb === 500);
  assert.ok(Number(byCode.pro.price_monthly) + Number(half.price) < Number(byCode.studio.price_monthly), 'USD');
  for (const r of regions.filter(x => x.code !== 'USD')) {
    const plan = (code) => Number(r.plan_region_prices.find(x => x.plan_id === byCode[code].id).monthly);
    const add = await addonPricesFor(r.countries[0]);
    assert.ok(plan('pro') + add.get(`${half.id}|`).monthly < plan('studio'), `${r.code}: Pro + 500 GB below Studio`);
  }
});

test('paying yearly saves about 17% on every paid plan, in every territory (Raj, 2026-11-12)', () => {
  const saves = (label, monthly, annual) => {
    const s = 1 - annual / (monthly * 12);
    assert.ok(s >= 0.165, `${label}: yearly saves only ${(s * 100).toFixed(1)}%`);
  };
  for (const code of ['essential', 'pro', 'studio']) saves(`USD ${code}`, Number(byCode[code].price_monthly), Number(byCode[code].price_annual));
  for (const r of regions.filter(x => x.code !== 'USD')) {
    for (const code of ['essential', 'pro', 'studio']) {
      const row = r.plan_region_prices.find(x => x.plan_id === byCode[code].id);
      saves(`${r.code} ${code}`, Number(row.monthly), Number(row.annual));
    }
  }
});

test('an add-on is charged in its subscription’s own currency', async () => {
  const tb = storage.find(s => s.storage_gb === 1000);
  const cad = await addonPriceForSubscription(tb.id, 'pro', 'CA', 'cad');
  assert.equal(cad.currency, 'CAD');
  assert.equal(await addonPriceForSubscription(tb.id, 'pro', 'US', 'usd'), null, 'a US subscription: the own USD price');
  assert.equal(await addonPriceForSubscription(tb.id, 'pro', 'CA', 'usd'), null, 'an older USD subscription stays in USD');
  assert.equal((await addonPriceForSubscription(tb.id, 'pro', 'PK', 'usd'))?.region, 'USD-R', 'regional: its own US-dollar price');
});

test('what a subscription charges is recorded as one amount', () => {
  assert.deepEqual(subscriptionCharge({ currency: 'cad', items: { data: [{ price: { unit_amount: 4900 }, quantity: 1 }, { price: { unit_amount: 3500 }, quantity: 1 }] } }), { currency: 'CAD', amount: 84 });
  assert.deepEqual(subscriptionCharge({ items: { data: [] } }), { currency: null, amount: null });
});

test('every territory has a fixed price for every plan and add-on', async () => {
  const addons = await prisma.services.count({ where: { is_addon: true, price: { gt: 0 }, is_private: false } });
  for (const r of regions.filter(x => x.code !== 'USD')) {
    assert.equal((await fixedPricesFor(r.countries[0])).size, plans.length, `${r.code} plans`);
    assert.ok(r.addon_region_prices.filter(a => a.plan_code === '').length >= addons, `${r.code} add-ons`);
  }
});
