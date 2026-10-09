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
  const key = s.quo_api_key || '';
  const vendorId = Number(s.quo_vendor_id || 0);
  /* Which piece is missing, in words a super admin can act on. "Not
     configured" alone sent Raj looking at a key that was fine — the vendor
     box was the empty one. */
  const missing = [];
  if (!key) missing.push('the API key');
  if (!vendorId) missing.push('whose timeline (the vendor)');
  const phoneNumberId = s.quo_phone_number_id || '';
  // a phone number saved before the picker existed — Quo answers it with "not found"
  if (phoneNumberId && !isQuoNumberId(phoneNumberId)) missing.push('a number picked from "List my numbers"');
  return {
    key,
    /* Quo can give each webhook its own signing secret (messages, calls,
       summaries, transcripts). They are saved one per line; a webhook is
       genuine if ANY of them signs it. */
    webhookSecrets: String(s.quo_webhook_secret || '').split(/[\s,]+/).filter(Boolean),
    phoneNumberId,
    vendorId,                                   // whose timeline these land in
    ready: missing.length === 0,
    missing,
  };
}

/** Quo's own id for a number looks like "PN…"; a phone number in its place is refused by Quo. */
export function isQuoNumberId(v) {
  return /^PN[A-Za-z0-9]+$/.test(String(v || ''));
}

/**
 * One request. OpenPhone takes the key raw in Authorization — no "Bearer",
 * which is unusual enough that getting it wrong reads as a bad key.
 *
 * 🚦 Paced and retried. Quo limits how fast a key may ask; filling thirty
 * calls at once (four requests each) was answered "Rate limit exceeded" and
 * those calls were left half-empty. Every request now waits its turn — no
 * more than about six a second across the whole process — and a 429 is
 * retried after the pause Quo asks for, rather than treated as "nothing there".
 */
const MIN_GAP_MS = 170;
let nextSlot = 0;
async function turn() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise(r => setTimeout(r, at - now));
}

async function call(key, path, params = {}, { method = 'GET', body: payload } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; ; attempt++) {
    await turn();
    const res = await fetch(url, {
      method,
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1000 * 2 ** attempt;
      await new Promise(r => setTimeout(r, Math.min(wait, 15_000)));
      continue;
    }
    if (!res.ok) {
      const err = new Error(body?.message || body?.errors?.[0]?.message || `Quo returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }
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

/**
 * The vendor's OWN numbers, as last-ten-digit keys. A call's `participants`
 * lists our line as well as the caller, so taking the first entry sometimes
 * filed a call under our own number. Asked once an hour, not per call.
 */
let own = { at: 0, key: '', set: new Set() };
export async function ownNumbers(key) {
  if (own.key !== key || Date.now() - own.at > 60 * 60_000) {
    const nums = await listPhoneNumbers(key);
    own = { at: Date.now(), key, set: new Set(nums.map(n => lastTen(n.number))) };
  }
  return own.set;
}
export function lastTen(n) { return String(n || '').replace(/\D/g, '').slice(-10); }

/** The other person on a call — the participant that is not one of our numbers. */
export function otherParticipant(participants, ours) {
  const list = (participants || []).map(p => p?.phoneNumber || p).filter(Boolean).map(String);
  return list.find(p => !ours.has(lastTen(p))) || null;
}

/**
 * ⚠️ Calls and messages can only be listed PER CONVERSATION: Quo refuses
 * /calls and /messages without `participants` ("must have required
 * property"). The first version asked for everything at once, was refused
 * every time, and the refusal was swallowed — Sync reported success with
 * nothing in it. So: list the conversations that moved recently, then ask
 * for each one's calls and messages.
 */
export async function listConversations(key, { phoneNumberId, updatedAfter, maxPages = 5 }) {
  const out = [];
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const r = await call(key, '/conversations', {
      phoneNumbers: phoneNumberId ? [phoneNumberId] : undefined,
      updatedAfter: updatedAfter ? new Date(updatedAfter).toISOString() : undefined,
      maxResults: 100,
      pageToken,
    });
    out.push(...(r?.data || []));
    pageToken = r?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
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

/* ══════════════════════════════════════════════════════════════════════
   🎧 What happened ON a call. The call list carries none of it — Quo keeps
   the recording, the AI summary and the transcript behind three separate
   endpoints, each keyed by the call's id. They were never fetched, so every
   call showed as an empty row. Measured on Raj's account: all three exist
   for completed calls (summary as a list of points, transcript as dialogue
   lines, recording as a signed share.quo.com link that EXPIRES — so it is
   fetched fresh each time somebody presses play, never stored).
   A 404 means "not made for this call" (missed, too short, plan without
   AI) and is answered with null, not an error.
   ══════════════════════════════════════════════════════════════════════ */
async function optional(key, path) {
  try { return (await call(key, path))?.data ?? null; }
  catch (e) { if (e.status === 404) return null; throw e; }
}
export const getCallSummary = (key, callId) => optional(key, `/call-summaries/${encodeURIComponent(callId)}`);
export const getCall = (key, callId) => optional(key, `/calls/${encodeURIComponent(callId)}`);
export const getMessage = (key, messageId) => optional(key, `/messages/${encodeURIComponent(messageId)}`);
export const getCallTranscript = (key, callId) => optional(key, `/call-transcripts/${encodeURIComponent(callId)}`);
export async function getCallRecordings(key, callId) {
  return (await optional(key, `/call-recordings/${encodeURIComponent(callId)}`)) || [];
}

/**
 * 📇 The contacts saved in Quo, by phone number (last ten digits) → { id,
 * name } — so the timeline says "Simran Kaur" rather than a number, and a
 * contact saved from iwopo updates the existing one instead of duplicating
 * it. Paged; a contact with several numbers is listed under each.
 */
export async function listContacts(key, { maxPages = 20 } = {}) {
  const byNumber = new Map();
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const r = await call(key, '/contacts', { maxResults: 50, pageToken });
    for (const c of r?.data || []) {
      const f = c.defaultFields || {};
      const name = [f.firstName, f.lastName].filter(Boolean).join(' ').trim() || f.company || '';
      for (const p of f.phoneNumbers || []) {
        const k = lastTen(p?.value);
        if (k) byNumber.set(k, { id: c.id, name: name.slice(0, 160) });
      }
    }
    pageToken = r?.nextPageToken;
    if (!pageToken) break;
  }
  return byNumber;
}

/**
 * ✍️ Save a person in Quo — it then shows in the Quo app on the phone too.
 * An existing contact (same number) is updated, never duplicated.
 */
export async function saveContact(key, { existingId, firstName, lastName, email, number }) {
  const defaultFields = {
    firstName, lastName: lastName || undefined,
    ...(email ? { emails: [{ name: 'Email', value: email }] } : {}),
  };
  if (existingId) {
    const r = await call(key, `/contacts/${encodeURIComponent(existingId)}`, {}, { method: 'PATCH', body: { defaultFields } });
    return { id: existingId, updated: true, data: r?.data };
  }
  const r = await call(key, '/contacts', {}, {
    method: 'POST',
    body: { defaultFields: { ...defaultFields, phoneNumbers: [{ name: 'Phone', value: number }] } },
  });
  return { id: r?.data?.id, updated: false, data: r?.data };
}

/**
 * 💬 Send a text from one of the vendor's Quo numbers. Quo sends it as the
 * business (its own A2P registration applies), and it appears in the Quo app
 * thread like any other. Returns Quo's message, ready for normalise().
 */
export async function sendMessage(key, { from, to, content }) {
  const r = await call(key, '/messages', {}, { method: 'POST', body: { content, from, to: [to] } });
  return r?.data || null;
}

/**
 * 🔒 Is this webhook really from Quo? Two signing schemes exist, and a
 * delivery carries one or the other:
 *
 *  NEW (webhooks made in Quo's app today, Standard Webhooks):
 *    headers webhook-id, webhook-timestamp (UNIX SECONDS), webhook-signature
 *    = space-separated "v1,<base64>"; signed "{id}.{timestamp}.{raw body}";
 *    secret "whsec_<base64>".
 *  LEGACY (openphone-signature):
 *    "hmac;1;<timestamp ms>;<base64>"; signed "{timestamp}.{raw body}";
 *    secret base64.
 *
 * ⚠️ 2026-10-09: the first version read the LEGACY header as
 * "version;timestamp;…", taking the "1" for the timestamp — every real
 * delivery looked decades old and was refused with 401, and it knew nothing
 * of the new scheme at all. Texts still arrived through the minute-by-minute
 * sync, which is why it looked like webhooks were merely slow.
 *
 * Constant-time compares; anything signed more than five minutes ago is
 * refused, so a captured delivery cannot be replayed.
 *
 * @returns {{ ok: boolean, scheme: string, why?: string }}
 */
const MAX_AGE_MS = 5 * 60_000;
const sameB64 = (x, y) => {
  const a = Buffer.from(String(x)), b = Buffer.from(String(y));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const keyBytes = (secret) => Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');

export function verifyWebhook(rawBody, headers, secrets) {
  const keys = (Array.isArray(secrets) ? secrets : [secrets]).filter(Boolean);
  if (!keys.length) return { ok: false, scheme: 'none', why: 'no signing secret saved' };
  const h = (n) => headers?.[n] ?? headers?.[n.toLowerCase()];

  if (h('webhook-signature')) {
    const id = h('webhook-id'), ts = h('webhook-timestamp'), sigs = String(h('webhook-signature'));
    if (!id || !ts) return { ok: false, scheme: 'standard', why: 'webhook-id or webhook-timestamp missing' };
    if (Math.abs(Date.now() - Number(ts) * 1000) > MAX_AGE_MS) return { ok: false, scheme: 'standard', why: 'too old' };
    const signed = `${id}.${ts}.${rawBody}`;
    const given = sigs.split(' ').map(s => s.split(',')).filter(([v]) => v === 'v1').map(([, s]) => s);
    const ok = keys.some(k => {
      const expected = crypto.createHmac('sha256', keyBytes(k)).update(signed).digest('base64');
      return given.some(g => sameB64(g, expected));
    });
    return ok ? { ok, scheme: 'standard' } : { ok, scheme: 'standard', why: 'no saved secret matches' };
  }

  const header = h('openphone-signature');
  if (!header) return { ok: false, scheme: 'none', why: 'no signature header' };
  // commas are reserved for several signatures in one header
  for (const one of String(header).split(',')) {
    const [scheme, version, ts, digest] = one.trim().split(';');
    if (scheme !== 'hmac' || version !== '1' || !ts || !digest) continue;
    if (Math.abs(Date.now() - Number(ts)) > MAX_AGE_MS) return { ok: false, scheme: 'legacy', why: 'too old' };
    const signed = `${ts}.${rawBody}`;
    if (keys.some(k => sameB64(digest, crypto.createHmac('sha256', keyBytes(k)).update(signed).digest('base64')))) {
      return { ok: true, scheme: 'legacy' };
    }
  }
  return { ok: false, scheme: 'legacy', why: 'no saved secret matches' };
}
