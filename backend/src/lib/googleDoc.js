/**
 * 📄 The knowledge base, mirrored into ONE Google Doc (Raj, 2026-10-14): the Gemini app on his phone can
 * read that doc, so everyday questions can be answered there — flat-rate, no API tokens. Read-only for
 * Gemini; Tornado still does the actions. Owner-only (platform setting gdoc_vendors).
 *
 * 💵 No money ever goes into the doc (Raj): no money section, and price / paid / balance fields and any
 * $ amount are taken out of every line.
 * 📬 The doc starts with "What are the updates": only what he hasn't seen yet (unopened leads, unseen
 * texts and calls, unseen bell items) — checked every minute and rewritten as soon as it changes.
 *
 * Access is a Google service account (its key pasted once in the panel) that can edit only the documents
 * shared with it. Every 10 minutes (and on "Sync now") the whole doc is rewritten from agent_kb:
 * one heading per section, one line per record — 1–2 write requests (Google allows 60 a minute).
 */
import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import { getSetting, setSetting } from './settings.js';
import { SECTIONS } from './agentKb.js';
import { whatsNew } from './voiceClips.js';

const TZ = 'America/Vancouver';
const b64url = (x) => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export async function gdocAllowed(vendorId) {
  return String(await getSetting('gdoc_vendors', '')).split(/[\s,]+/).filter(Boolean).map(Number).includes(Number(vendorId));
}

/** The document id from a Google Docs link (or the id itself). */
export function docIdOf(link) {
  const m = String(link || '').match(/\/document\/d\/([a-zA-Z0-9_-]{20,})/) || String(link || '').match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

async function serviceAccount() {
  const raw = await getSetting('gdoc_service_account', '');
  if (!raw) return null;
  try { const sa = JSON.parse(raw); return sa.client_email && sa.private_key ? sa : null; } catch { return null; }
}

/** A short-lived Google access token for the service account (signed JWT → token). */
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/documents', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key);
  const jwt = `${head}.${claim}.${b64url(sig)}`;
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const d = await r.json();
  if (!d.access_token) throw new Error(`Google sign-in failed: ${d.error_description || d.error || r.status}`);
  return d.access_token;
}

/* 💵 money out: whole fields (price, paid, balance, deposit, total…) and any $ amount */
const MONEY_FIELD = /\s*\|\s*[^|:]*\b(price|paid|balance|amount|deposit|total|cost|fee|invoice|payment|owed|revenue)\b[^|:]*:[^|]*/gi;
const noMoney = (t) => String(t).replace(MONEY_FIELD, '').replace(/\$\s?[\d,]+(\.\d+)?/g, '').replace(/\s{2,}/g, ' ').trim();

/** The doc's text: the unseen updates first, then every section (never money). */
async function docText(v) {
  const rows = await prisma.agent_kb.findMany({ where: { vendor_id: v, section: { not: 'money' } }, orderBy: [{ section: 'asc' }, { updated_at: 'desc' }], select: { section: true, text: true } });
  const when = new Date().toLocaleString('en-CA', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
  const parts = [{ text: `iwopo — business notes (updated ${when})`, style: 'TITLE' }];
  // 📬 only what is unseen: unopened leads, unseen texts / calls, unseen bell items (no counting — a read, not a wake-up)
  const w = await whatsNew(v, { record: false });
  const unseen = (w.names || []).filter(n => /^(🆕|💬|📞|🔔)/u.test(n)).map(noMoney);
  parts.push({ text: 'What are the updates', style: 'HEADING_1' });
  if (unseen.length) for (const n of unseen) parts.push({ text: n, style: null });
  else parts.push({ text: 'Nothing new — everything has been seen.', style: null });
  for (const [key, label] of SECTIONS) {             // SECTIONS is a list of [key, label]
    if (key === 'money') continue;
    const lines = rows.filter(r => r.section === key).map(r => noMoney(r.text)).filter(Boolean);
    if (!lines.length) continue;
    parts.push({ text: `${label} (${lines.length})`, style: 'HEADING_2' });
    for (const l of lines) parts.push({ text: l, style: null });
  }
  return parts;
}

/** Rewrite the whole doc. Returns what was written. */
export async function syncDoc(vendorId, { force = true } = {}) {
  const v = Number(vendorId);
  const sa = await serviceAccount();
  const id = docIdOf(await getSetting('gdoc_document_id', ''));
  if (!sa || !id) throw new Error('Not set up yet — paste the doc link and the service-account key first.');
  const parts = await docText(v);
  const hash = crypto.createHash('sha1').update(parts.slice(1).map(p => p.text).join('\n')).digest('hex');
  if (!force && hash === (await getSetting('gdoc_last_hash', ''))) return { unchanged: true };
  const token = await accessToken(sa);
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const g = await fetch(`https://docs.googleapis.com/v1/documents/${id}?fields=body.content(endIndex)`, { headers: H });
  if (g.status === 403 || g.status === 404) throw new Error(`Google can't open the doc — share it with ${sa.client_email} as Editor.`);
  const doc = await g.json();
  const end = Math.max(...(doc.body?.content || []).map(c => c.endIndex || 1), 1);
  const text = parts.map(p => p.text).join('\n') + '\n';
  const requests = [];
  if (end > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: end - 1 } } });
  requests.push({ insertText: { location: { index: 1 }, text } });
  // every paragraph gets its style: the title, a heading per section, normal text for records
  let at = 1;
  for (const p of parts) {
    const len = Buffer.from(p.text, 'utf16le').length / 2 + 1;   // Google counts UTF-16 units (an emoji is 2)
    requests.push({ updateParagraphStyle: { range: { startIndex: at, endIndex: at + len }, paragraphStyle: { namedStyleType: p.style || 'NORMAL_TEXT' }, fields: 'namedStyleType' } });
    at += len;
  }
  const u = await fetch(`https://docs.googleapis.com/v1/documents/${id}:batchUpdate`, { method: 'POST', headers: H, body: JSON.stringify({ requests }) });
  if (!u.ok) throw new Error(`Google refused the update: ${(await u.text()).slice(0, 200)}`);
  const result = { at: new Date().toISOString(), lines: parts.length - 1, chars: text.length };
  await setSetting('gdoc_last_sync', JSON.stringify(result));
  await setSetting('gdoc_last_hash', hash);
  return result;
}

/** What the panel shows: set up or not, the service account to share with, the last sync. */
export async function docStatus() {
  const sa = await serviceAccount();
  const link = await getSetting('gdoc_document_id', '');
  let last = null;
  try { last = JSON.parse(await getSetting('gdoc_last_sync', '') || 'null'); } catch { /* none yet */ }
  const err = await getSetting('gdoc_last_error', '');
  return { service_account: sa?.client_email || null, doc_id: docIdOf(link), doc_url: docIdOf(link) ? `https://docs.google.com/document/d/${docIdOf(link)}/edit` : null, last, error: err || null };
}

/** Save the doc link and/or the service-account key (the key is checked, never shown again). */
export async function docSetup({ link, key }) {
  if (link !== undefined) {
    if (!docIdOf(link)) throw new Error("That doesn't look like a Google Docs link.");
    await setSetting('gdoc_document_id', docIdOf(link));
  }
  if (key) {
    let sa;
    try { sa = JSON.parse(key); } catch { throw new Error('The key must be the JSON file Google gave you.'); }
    if (!sa.client_email || !sa.private_key) throw new Error('That JSON is not a service-account key.');
    await setSetting('gdoc_service_account', JSON.stringify({ client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri }));
  }
  return docStatus();
}

/** ⏲️ Every minute, for each vendor who has it — written only when something changed. */
export async function syncDocs() {
  const ids = String(await getSetting('gdoc_vendors', '')).split(/[\s,]+/).filter(Boolean).map(Number);
  for (const v of ids) {
    try { await syncDoc(v, { force: false }); await setSetting('gdoc_last_error', ''); }
    catch (e) { await setSetting('gdoc_last_error', String(e.message).slice(0, 300)); }
  }
}

/** What the doc would say right now (for checking, without touching Google). */
export async function previewDoc(vendorId) {
  return (await docText(Number(vendorId))).map(p => p.text);
}
