/**
 * 📞 Talking to Quo (OpenPhone).
 *
 * ⚠️ What this API can and cannot do, established the hard way when this was
 * built for Perfect Poses:
 *
 *   CAN   read calls, recordings, transcripts and summaries
 *   CAN   read and SEND messages
 *   CANNOT place a call — POST /calls is a 404, eleven path guesses were all
 *         404, and OPTIONS advertises no POST. It is not a permissions problem
 *         or a plan limit; the route does not exist.
 *
 * So this mirrors a history. Dialling happens on an actual phone.
 *
 * 🔒 The key lives in platform_settings, entered by a super admin in the panel,
 * the same as the R2 and mail credentials. Never in a file, never in the repo.
 */
import crypto from 'node:crypto';
import { getAllSettings } from './settings.js';

const BASE = 'https://api.openphone.com/v1';

/** The credentials, or a clear reason there are none. */
export async function quoConfig() {
  const s = await getAllSettings().catch(() => ({}));
  return {
    key: s.quo_api_key || '',
    webhookSecret: s.quo_webhook_secret || '',
    phoneNumberId: s.quo_phone_number_id || '',
    vendorId: Number(s.quo_vendor_id || 0),     // whose timeline these land in
    ready: !!s.quo_api_key,
  };
}

/**
 * One request. OpenPhone takes the key raw in Authorization — no "Bearer",
 * which is unusual enough that getting it wrong reads as a bad key.
 */
async function call(key, path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: key, 'Content-Type': 'application/json' } });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const err = new Error(body?.message || body?.errors?.[0]?.message || `Quo returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/** The numbers on the account — also the simplest proof a key works. */
export async function listPhoneNumbers(key) {
  const r = await call(key, '/phone-numbers');
  return (r?.data || []).map(n => ({
    id: n.id,
    number: n.number,
    name: n.name || n.formattedNumber || n.number,
  }));
}

export async function listCalls(key, { phoneNumberId, participants, since, max = 50 }) {
  const r = await call(key, '/calls', {
    phoneNumberId, participants,
    createdAfter: since ? new Date(since).toISOString() : undefined,
    maxResults: max,
  });
  return r?.data || [];
}

export async function listMessages(key, { phoneNumberId, participants, since, max = 50 }) {
  const r = await call(key, '/messages', {
    phoneNumberId, participants,
    createdAfter: since ? new Date(since).toISOString() : undefined,
    maxResults: max,
  });
  return r?.data || [];
}

/**
 * 🔒 Is this webhook really from Quo?
 *
 * The signature header is version;timestamp;random;digest, and the digest is an
 * HMAC over "timestamp.body" using the base64-decoded secret. Without this
 * check the endpoint is a public write to a vendor's timeline — anyone could
 * post a fabricated call.
 *
 * Compared with timingSafeEqual, because a plain === leaks how much of a guess
 * was right through how long the comparison took.
 */
export function verifyWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = String(signatureHeader).split(';');
  if (parts.length < 4) return false;
  const [, timestamp, , digest] = parts;
  if (!timestamp || !digest) return false;

  /* An old signature replayed is still a valid signature, so anything older
     than five minutes is refused whatever it says. */
  const age = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60_000) return false;

  const signed = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(signed).digest('base64');

  const a = Buffer.from(digest), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
