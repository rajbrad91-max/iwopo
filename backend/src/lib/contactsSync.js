/**
 * 📇 Google Contacts ↔ Quo (Raj, 2026-10-23): "save a number once, not in two places".
 *  - every 15 minutes: Google contacts with a phone number that Quo doesn't have yet are added to Quo
 *    (one-way for edits — a contact already in Quo is never changed or duplicated)
 *  - saving a contact in Calls & Messages also adds it to Google, unless Google already has that number
 * Uses the vendor's own Google connection (Gmail + Contacts permission) and their own Quo key.
 */
import prisma from '../config/prisma.js';
import { quoConfigs, saveContact } from './quo.js';
import { contactsByNumber, forgetContacts } from './commsEnrich.js';
import { googleApi, status } from './inboxGmail.js';

const PEOPLE = 'https://people.googleapis.com/v1';
const stateKey = (v) => `gcontacts_sync_${Number(v)}`;
const key10 = (n) => String(n || '').replace(/\D/g, '').slice(-10);
const pause = (ms) => new Promise(r => setTimeout(r, ms));

async function saveState(v, data) {
  const value = JSON.stringify({ ...data, at: new Date().toISOString() });
  await prisma.platform_settings.upsert({ where: { key: stateKey(v) }, create: { key: stateKey(v), value }, update: { value } });
}
export async function syncState(v) {
  const r = await prisma.platform_settings.findUnique({ where: { key: stateKey(v) } });
  try { return r ? JSON.parse(r.value) : null; } catch { return null; }
}

/** a Google error in plain words (missing permission / API switched off) */
function plain(e) {
  const m = String(e?.message || e);
  if (/insufficient|scope|PERMISSION_DENIED.*scope/i.test(m)) return 'Google Contacts permission missing — reconnect Gmail in Email → ⚙️ and allow Contacts.';
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(m)) return 'The People API is switched off in your Google Cloud project — turn it on, then try again.';
  return m.slice(0, 200);
}

/** every Google contact (name, phones, first email) */
async function googleContacts(v) {
  const out = []; let token = '';
  do {
    const d = await googleApi(v, `${PEOPLE}/people/me/connections?personFields=names,phoneNumbers,emailAddresses&pageSize=1000${token ? `&pageToken=${token}` : ''}`);
    out.push(...(d.connections || []));
    token = d.nextPageToken || '';
  } while (token && out.length < 5000);
  return out;
}

/** Google → Quo: add what Quo doesn't have yet */
export async function syncGoogleToQuo(v) {
  const cfg = (await quoConfigs()).find(c => c.vendorId === Number(v) && c.ready);
  const st = await status(v);
  if (!cfg || !st.connected || st.sandbox) return { skipped: true };
  try {
    const people = await googleContacts(v);
    forgetContacts();
    const inQuo = await contactsByNumber(cfg.key);
    let added = 0;
    for (const p of people) {
      const n = p.names?.[0] || {};
      const first = n.givenName || n.displayName;
      if (!first) continue;
      for (const ph of p.phoneNumbers || []) {
        const raw = ph.canonicalForm || ph.value || '';
        const k = key10(raw);
        if (k.length !== 10 || inQuo.has(k)) continue;
        const digits = raw.replace(/\D/g, '');
        await saveContact(cfg.key, { firstName: first, lastName: n.familyName, email: p.emailAddresses?.[0]?.value, number: raw.startsWith('+') ? `+${digits}` : `+1${k}` });
        inQuo.set(k, { id: 'new' });
        added++;
        await pause(150);                                    // gentle on Quo's rate limit (first run may add many)
      }
    }
    forgetContacts();
    await saveState(v, { ok: true, google: people.length, added });
    return { added, google: people.length };
  } catch (e) {
    await saveState(v, { ok: false, error: plain(e) });
    return { error: plain(e) };
  }
}

/** iwopo → Google: a contact saved in Calls & Messages goes to Google too (never twice) */
export async function addToGoogle(v, { firstName, lastName, email, number }) {
  const st = await status(v);
  if (!st.connected || st.sandbox) return { skipped: true };
  try {
    const k = key10(number);
    if ((await googleContacts(v)).some(p => (p.phoneNumbers || []).some(ph => key10(ph.canonicalForm || ph.value) === k))) return { exists: true };
    await googleApi(v, `${PEOPLE}/people:createContact`, { method: 'POST', body: {
      names: [{ givenName: firstName, familyName: lastName || undefined }],
      phoneNumbers: [{ value: number }],
      ...(email ? { emailAddresses: [{ value: email }] } : {}),
    } });
    return { added: true };
  } catch (e) { return { error: plain(e) }; }
}

/** every vendor with both Quo and Google connected */
export async function syncAllContacts() {
  try {
    const quo = new Set((await quoConfigs()).filter(c => c.ready).map(c => c.vendorId));
    for (const s of await prisma.platform_settings.findMany({ where: { key: { startsWith: 'gmail_link_' } }, select: { key: true } })) {
      const v = Number(s.key.slice(11));
      if (quo.has(v)) await syncGoogleToQuo(v).catch(e => console.error(`[contacts] vendor ${v}:`, e.message));
    }
  } catch (e) { console.error('[contacts] sync failed:', e.message); }
}
