import prisma from '../config/prisma.js';
import { stripe } from './stripe.js';
import { currentPlan, paidSubscription } from './billing.js';
import { usdRate, convert } from './localPrice.js';

/**
 * ➕ Add-ons (Raj, 2026-11-06): extra storage (+500 GB / +1 TB / +2 TB), Crew on Essential, your own domain on Essential
 * and Pro, Instagram & WhatsApp AI (half price on Studio). Each is a service row with a price; plan_codes says which plans
 * may add it, plan_prices a different price on some. A paying vendor adds one to their Stripe subscription (charged the
 * difference now) and removes it from the next bill — it keeps working until the period it was paid for ends.
 */
const isAddon = { is_addon: true, price: { gt: 0 }, is_private: false };

export const priceFor = (svc, planCode, cycle) => {
  const monthly = Number((svc.plan_prices || {})[planCode] ?? svc.price);
  return cycle === 'annual' ? (svc.plan_prices?.[planCode] != null ? monthly * 10 : Number(svc.price_annual ?? monthly * 10)) : monthly;
};

/** The add-ons as this vendor sees them: price on their plan, and whether each is included, theirs, open or not yet. */
export async function addonsFor(vendorId, { currency } = {}) {
  const vid = Number(vendorId);
  const rate = await usdRate(currency);   // 🌍 shown in the vendor's currency, as an estimate
  const [{ plan, reason }, sub, rows, mine] = await Promise.all([
    currentPlan(vid), paidSubscription(vid),
    prisma.services.findMany({ where: isAddon, orderBy: [{ storage_gb: 'asc' }, { price: 'asc' }, { id: 'asc' }] }),
    prisma.vendor_services.findMany({ where: { vendor_id: vid, enabled: true }, select: { service_id: true, ends_at: true } }),   // 🔒 this vendor
  ]);
  const cycle = sub?.billing_cycle === 'annual' ? 'annual' : 'monthly';
  const planKeys = new Set((plan?.plan_features || []).map(f => f.feature_key));
  const owned = new Map(mine.map(m => [m.service_id, m.ends_at]));
  return rows.map(s => {
    const codes = Array.isArray(s.plan_codes) ? s.plan_codes : [];
    const included = !!s.feature_key && planKeys.has(s.feature_key);
    const state = !s.is_live ? 'coming'
      : included ? 'included'
      : owned.has(s.id) ? (owned.get(s.id) ? 'ending' : 'added')
      : codes.length && !codes.includes(plan?.code) ? 'not_on_plan'
      : !sub ? 'choose_plan'
      : 'available';
    return {
      id: s.id, name: s.name, icon: s.icon, description: s.description, storage_gb: s.storage_gb,
      price: priceFor(s, plan?.code, 'monthly'), price_annual: priceFor(s, plan?.code, 'annual'), cycle,
      plans: codes, state, ends_at: owned.get(s.id) || null, on_trial: reason === 'trial',
      local: rate ? { currency: String(currency).toUpperCase(), price: convert(priceFor(s, plan?.code, 'monthly'), rate), price_annual: convert(priceFor(s, plan?.code, 'annual'), rate) } : null,
    };
  });
}

async function stripePriceForAddon(svc, planCode, cycle, currency = 'usd') {
  const cur = String(currency).toLowerCase();
  const rate = cur === 'usd' ? 1 : await usdRate(cur);
  if (!rate) throw Object.assign(new Error('Add-ons are not available in this currency yet — please contact support.'), { status: 409 });
  const cents = Math.round(convert(priceFor(svc, planCode, cycle), rate) * 100);
  const lookup = `iwopo_addon_${svc.id}_${cycle}_${cur}_${cents}`;
  const found = await stripe('GET', '/prices', { lookup_keys: [lookup], active: true, limit: 1 });
  if (found.data?.[0]) return found.data[0].id;
  const price = await stripe('POST', '/prices', {
    currency: cur, unit_amount: cents, lookup_key: lookup, transfer_lookup_key: true,
    product_data: { name: `iwopo ${svc.name}`, metadata: { service_id: svc.id } },
    recurring: { interval: cycle === 'annual' ? 'year' : 'month' }, metadata: { service_id: svc.id, cycle },
  }, { idempotencyKey: `addon-price-${lookup}` });
  return price.id;
}

/** Add an add-on to a paying vendor's subscription. Errors carry a status and a plain message. */
export async function addAddon(vendorId, serviceId) {
  const vid = Number(vendorId);
  const list = await addonsFor(vid);
  const a = list.find(x => x.id === Number(serviceId));
  const no = (status, message) => Object.assign(new Error(message), { status });
  if (!a) throw no(404, 'No such add-on');
  if (a.state === 'added' || a.state === 'included') return a;
  if (a.state === 'coming') throw no(409, `${a.name} is coming soon`);
  if (a.state === 'not_on_plan') throw no(409, `${a.name} can be added on ${a.plans.join(' and ')}`);
  if (a.state === 'choose_plan') throw no(409, 'Choose a plan first — add-ons go on a paid plan');
  const [sub, svc, { plan }] = await Promise.all([
    paidSubscription(vid), prisma.services.findUnique({ where: { id: a.id } }), currentPlan(vid),
  ]);
  if (a.state === 'available') {
    const { currency } = await stripe('GET', `/subscriptions/${sub.stripe_subscription_id}`);   // 🌍 the subscription's own currency
    await stripe('POST', '/subscription_items', {
      subscription: sub.stripe_subscription_id, price: await stripePriceForAddon(svc, plan.code, a.cycle, currency), quantity: 1,
      proration_behavior: 'create_prorations', metadata: { service_id: svc.id, vendor_id: vid },
    }, { idempotencyKey: `addon-${vid}-${svc.id}-${Date.now()}` });
  }
  // 'ending' (removed, still in its paid period) is simply kept on: the Stripe item is back above, or never left
  const row = await prisma.vendor_services.findFirst({ where: { vendor_id: vid, service_id: svc.id } });   // 🔒 this vendor
  if (row) await prisma.vendor_services.update({ where: { id: row.id }, data: { enabled: true, ends_at: null } });
  else await prisma.vendor_services.create({ data: { vendor_id: vid, service_id: svc.id, enabled: true } });
  return (await addonsFor(vid)).find(x => x.id === svc.id);
}

/** Remove an add-on from the next bill: no refund, it keeps working until the paid period ends. */
export async function removeAddon(vendorId, serviceId) {
  const vid = Number(vendorId), sid = Number(serviceId);
  const row = await prisma.vendor_services.findFirst({ where: { vendor_id: vid, service_id: sid, enabled: true } });   // 🔒 this vendor
  if (!row) return null;
  const sub = await paidSubscription(vid);
  let until = new Date();
  if (sub?.stripe_subscription_id) {
    const items = await stripe('GET', '/subscription_items', { subscription: sub.stripe_subscription_id, limit: 100 });
    for (const it of items.data || []) {
      if (String(it.metadata?.service_id || it.price?.metadata?.service_id) === String(sid)) {
        await stripe('DELETE', `/subscription_items/${it.id}`, { proration_behavior: 'none' });
      }
    }
    if (sub.current_period_end) until = new Date(sub.current_period_end);
  }
  await prisma.vendor_services.update({ where: { id: row.id }, data: { ends_at: until } });
  return (await addonsFor(vid)).find(x => x.id === sid);
}
