import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import { stripe, stripeReady, verifyWebhook } from './stripe.js';
import { getSetting } from './settings.js';
import { notify } from '../routes/notifications.js';
import { markBooked } from '../routes/payments.js';

/**
 * 💳 Stripe Connect (Raj, 2026-11-06). A vendor signs in to THEIR OWN Stripe account (Standard account, OAuth — Stripe's
 * route for connecting an existing account) and their clients can pay by card from the portal. The charge is made ON
 * the vendor's account: the money goes straight to them, refunds and disputes are theirs, and iwopo never holds it.
 * No platform fee. A vendor without Stripe makes an account on Stripe's own site first. Every plan includes it.
 *   Super Admin → Settings → Stripe Connect: the platform's Connect client ID (ca_…) and the connected-accounts webhook secret.
 */
const APP_URL = process.env.APP_URL || 'https://iwopo.com';
const OAUTH = 'https://connect.stripe.com/oauth';
const secretKey = () => process.env.STRIPE_SECRET_KEY || '';

export async function connectReady() {
  return stripeReady() && /^ca_/.test(String(await getSetting('stripe_connect_client_id', '') || ''));
}

// the sign-in is tied to the vendor who started it, for half an hour
const sign = (s) => crypto.createHmac('sha256', process.env.JWT_SECRET || secretKey()).update(s).digest('base64url');
const stateFor = (vid) => { const p = `${vid}.${Date.now() + 30 * 60_000}`; return `${p}.${sign(p)}`; };
function vendorFromState(state) {
  const [vid, exp, mac] = String(state || '').split('.');
  if (!vid || !mac || Number(exp) < Date.now()) return null;
  const want = sign(`${vid}.${exp}`);
  return want.length === mac.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac)) ? Number(vid) : null;
}

/** Where "Connect your Stripe account" sends the vendor: Stripe's own sign-in. */
export async function connectUrl(vendorId, email) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: await getSetting('stripe_connect_client_id', ''), scope: 'read_write',
    state: stateFor(vendorId), redirect_uri: `${APP_URL}/api/stripe-connect/callback`,
  });
  if (email) q.set('stripe_user[email]', email);
  return `${OAUTH}/authorize?${q}`;
}

async function oauth(path, params) {
  const r = await fetch(`${OAUTH}/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error_description || d.error || 'Stripe could not connect'), { status: 400 });
  return d;
}

/** Stripe sends the vendor back with a code: turn it into their account and keep it on the vendor. */
export async function finishConnect(state, code) {
  const vid = vendorFromState(state);
  if (!vid) throw Object.assign(new Error('That link has expired — please try connecting again.'), { status: 400 });
  const d = await oauth('token', { grant_type: 'authorization_code', code });
  await prisma.vendor_settings.upsert({
    where: { vendor_id: vid },                                                          // 🔒 the vendor who started it
    update: { stripe_account_id: d.stripe_user_id, stripe_connected_at: new Date() },
    create: { vendor_id: vid, stripe_account_id: d.stripe_user_id, stripe_connected_at: new Date() },
  });
  return vid;
}

export async function disconnect(vendorId) {
  const vid = Number(vendorId);
  const s = await prisma.vendor_settings.findUnique({ where: { vendor_id: vid }, select: { stripe_account_id: true } });   // 🔒 this vendor
  if (s?.stripe_account_id) {
    await oauth('deauthorize', { client_id: await getSetting('stripe_connect_client_id', ''), stripe_user_id: s.stripe_account_id }).catch(() => {});
    await prisma.vendor_settings.update({ where: { vendor_id: vid }, data: { stripe_account_id: null, stripe_connected_at: null } });
  }
}

export async function accountOf(vendorId) {
  const s = await prisma.vendor_settings.findUnique({ where: { vendor_id: Number(vendorId) }, select: { stripe_account_id: true, stripe_connected_at: true } });   // 🔒 this vendor
  return s?.stripe_account_id ? s : null;
}

/** A Stripe Checkout page ON the vendor's account for what the client owes now (the deposit, then the balance). */
export async function cardCheckout({ lead, amount, currency, description, token }) {
  const acct = await accountOf(lead.vendor_id);
  if (!acct || !await connectReady()) throw Object.assign(new Error('Card payments are not set up for this booking.'), { status: 409 });
  const cents = Math.round(Number(amount) * 100);
  if (!(cents > 0)) throw Object.assign(new Error('Nothing is due right now.'), { status: 409 });
  const meta = { lead_id: lead.id, vendor_id: lead.vendor_id };
  const session = await stripe('POST', '/checkout/sessions', {
    mode: 'payment', customer_email: lead.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: String(currency || 'usd').toLowerCase(), unit_amount: cents, product_data: { name: description } } }],
    metadata: meta, payment_intent_data: { metadata: meta, description },
    success_url: `${APP_URL}/portal/${token}?paid=card`, cancel_url: `${APP_URL}/portal/${token}`,
  }, { account: acct.stripe_account_id, idempotencyKey: `card-${lead.id}-${cents}-${Math.floor(Date.now() / 60_000)}` });
  return session.url;
}

/** A paid Checkout on a connected account, recorded once on the lead — only if it is that vendor's account. */
export async function handleConnectEvent(rawBody, header) {
  const event = verifyWebhook(rawBody, header, await getSetting('stripe_connect_webhook_secret', '') || '');
  if (!event) return { ok: false };
  if (event.type !== 'checkout.session.completed') return { ok: true };
  const s = event.data?.object || {};
  const leadId = Number(s.metadata?.lead_id);
  if (!leadId || s.payment_status !== 'paid') return { ok: true };
  const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { id: true, vendor_id: true, name: true } });
  const acct = lead && await accountOf(lead.vendor_id);
  if (!lead || !acct || acct.stripe_account_id !== event.account) return { ok: true };   // 🔒 the account the lead's vendor connected
  if (await prisma.payments.findUnique({ where: { reference: s.id } })) return { ok: true };   // already recorded
  const amount = (s.amount_total || 0) / 100;
  await prisma.payments.create({ data: { vendor_id: lead.vendor_id, lead_id: lead.id, amount, method: 'card', note: 'Paid by card (Stripe)', reference: s.id, paid_at: new Date() } });
  await markBooked(lead.id);
  notify(lead.vendor_id, `💳 ${lead.name || 'A client'} paid ${amount.toFixed(2)} by card`, 'Straight to your Stripe account', 'payment', { type: 'lead', id: lead.id });
  return { ok: true };
}
