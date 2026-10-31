/**
 * 💳 A small, dependency-free Stripe client (2026-10-31).
 *
 * Talks to the Stripe REST API with fetch (form-encoded, as Stripe expects) and verifies webhook signatures with
 * Node's crypto — no SDK to install or keep in step between staging and live. Keys come from the environment only:
 *   STRIPE_SECRET_KEY      sk_test_… on staging, sk_live_… on live
 *   STRIPE_WEBHOOK_SECRET  whsec_… (written by scripts/stripeSetup.js when it creates the webhook endpoint)
 */
import crypto from 'node:crypto';

const API = 'https://api.stripe.com/v1';
export const stripeReady = () => /^sk_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '');
export const stripeMode = () => (String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'live' : 'test');

/** Stripe's bracket encoding: { a: { b: 1 }, c: [ { d: 2 } ] } → a[b]=1&c[0][d]=2 */
function encode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)])));
    else if (typeof v === 'object') encode(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

/** One Stripe API call. Throws an Error carrying Stripe's own message. */
export async function stripe(method, path, params, { idempotencyKey } = {}) {
  if (!stripeReady()) throw new Error('Payments are not set up yet.');
  const headers = { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2024-06-20' };
  let url = API + path, body;
  const pairs = encode(params);
  if (method === 'GET') { if (pairs.length) url += '?' + new URLSearchParams(pairs); }
  else { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(pairs).toString(); }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await fetch(url, { method, headers, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data?.error?.message || `Stripe error ${r.status}`); e.status = r.status; e.stripe = data?.error; throw e; }
  return data;
}

/**
 * The event, if the Stripe-Signature header proves Stripe sent these exact bytes (within 5 minutes); otherwise null.
 * The body must be the RAW request bytes — the route is mounted before express.json() for that reason.
 */
export function verifyWebhook(rawBody, header) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret || !header) return null;
  const parts = Object.fromEntries(String(header).split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const t = Number(parts.t);
  const sigs = String(header).split(',').filter(p => p.trim().startsWith('v1=')).map(p => p.trim().slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const ok = sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) return null;
  try { return JSON.parse(rawBody); } catch { return null; }
}
