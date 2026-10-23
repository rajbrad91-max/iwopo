/**
 * 📧 Inbox → Email (Gmail) — the owner's private inbox (Raj, 2026-10-22). Reached only through the private
 * Calls & Messages feature (gate 'comms'), so no other vendor can use or see it.
 *
 * Security:
 *  - Google's OAuth client id/secret live in Super Admin (write-only, never in git).
 *  - The mailbox "pass" Google returns (refresh token) is stored ENCRYPTED (AES-256-GCM) with INBOX_SECRET,
 *    a key that exists only in the server's own .env. The database alone cannot open it.
 *  - The sign-in round trip carries a signed, short-lived state, so a link cannot attach someone else's mailbox.
 * Staging: with COMMS_SANDBOX=1 and nothing connected, a practice mailbox answers instead (nothing is sent).
 */
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { secretKey, seal, unseal } from './secretBox.js';

const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';   // read, label read/unread, compose and send
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const linkKey = (v) => `gmail_link_${Number(v)}`;

async function setting(key) { return (await prisma.platform_settings.findUnique({ where: { key } }))?.value || ''; }
async function saveSetting(key, value) { await prisma.platform_settings.upsert({ where: { key }, create: { key, value }, update: { value } }); }

const sign = (s) => crypto.createHmac('sha256', secretKey()).update(s).digest('base64url');

export const sandbox = () => process.env.COMMS_SANDBOX === '1';

/* 🔑 The vendor's OWN Google app keys (Raj, 2026-10-23): pasted in their Email tab, stored encrypted per vendor. */
const appKey = (v) => `gmail_app_${Number(v)}`;
export async function gmailClient(v) {
  const raw = await setting(appKey(v));
  if (!raw) return { id: '', secret: '' };
  try { return unseal(raw); } catch { return { id: '', secret: '' }; }
}
export async function saveApp(v, { client_id, client_secret } = {}) {
  const cur = await gmailClient(v);
  const id = String(client_id || '').trim() || cur.id;
  const secret = String(client_secret || '').trim() || cur.secret;
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error("That Client ID doesn't look right — it ends in .apps.googleusercontent.com.");
  if (!secret) throw new Error('Paste the Client secret too.');
  await saveSetting(appKey(v), seal({ id, secret }));
  tokens.delete(Number(v));
}
/** what the panel may show about the keys: whether they exist, and a short hint of the ID (never the secret) */
export async function appInfo(v) {
  const c = await gmailClient(v);
  return c.id ? { has_app: true, client_id_hint: `${c.id.slice(0, 8)}…${c.id.slice(c.id.indexOf('.apps'))}` } : { has_app: false };
}
export async function linkOf(v) {
  const raw = await setting(linkKey(v));
  if (!raw) return null;
  try { return unseal(raw); } catch { return null; }
}

/** What the page shows: configured? connected? as whom? (never any key) */
export async function status(v) {
  const c = await gmailClient(v).catch(() => ({}));
  const link = await linkOf(v).catch(() => null);
  if (link) return { connected: true, email: link.email };
  if (sandbox()) return { connected: true, sandbox: true, email: 'practice@example.com' };
  return { connected: false, configured: !!(c.id && c.secret && process.env.INBOX_SECRET) };
}

/** The Google sign-in address for this vendor (state is signed and lasts ten minutes). */
export async function connectUrl(v, redirectUri) {
  const c = await gmailClient(v);
  if (!c.id || !c.secret) throw new Error('Email is not set up yet.');
  const body = `${Number(v)}.${Date.now() + 600_000}.${crypto.randomBytes(8).toString('hex')}`;
  const p = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: `${body}.${sign(body)}` });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Google came back: check the state, swap the code for a refresh token, store it encrypted. */
export async function finishConnect(state, code, redirectUri) {
  const parts = String(state || '').split('.');
  const body = parts.slice(0, 3).join('.');
  if (parts.length !== 4 || sign(body) !== parts[3] || Number(parts[1]) < Date.now()) throw new Error('This sign-in link has expired. Please try again.');
  const v = Number(parts[0]);
  const c = await gmailClient(v);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  const t = await r.json();
  if (!r.ok || !t.refresh_token) throw new Error('Google did not hand over access. Please try again.');
  const prof = await (await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
  await saveSetting(linkKey(v), seal({ refresh_token: t.refresh_token, email: prof.emailAddress || '' }));
  tokens.set(v, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
  return v;
}

export async function disconnect(v) {
  const link = await linkOf(v);
  if (link?.refresh_token) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(link.refresh_token)}`, { method: 'POST' }).catch(() => {});
  await prisma.platform_settings.deleteMany({ where: { key: linkKey(v) } });
  tokens.delete(Number(v));
}

const tokens = new Map();   // vendor → { token, until } — Google's short-lived access token
async function accessToken(v) {
  const hit = tokens.get(Number(v));
  if (hit && hit.until > Date.now()) return hit.token;
  const link = await linkOf(v);
  if (!link) throw new Error('not_connected');
  const c = await gmailClient(v);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: link.refresh_token, grant_type: 'refresh_token' }) });
  const t = await r.json();
  if (!r.ok) throw new Error(t.error === 'invalid_grant' ? 'Your Gmail connection has ended. Connect it again.' : 'Gmail did not answer.');
  tokens.set(Number(v), { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
  return t.access_token;
}
async function gmail(v, path, opts = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${await accessToken(v)}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `Gmail error ${r.status}`);
  return d;
}

const header = (m, name) => (m.payload?.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
const b64 = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function bodyOf(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return b64(part.body.data);
  for (const p of part.parts || []) { const t = bodyOf(p); if (t) return t; }
  if (part.mimeType === 'text/html' && part.body?.data) return b64(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return '';
}

/* ── practice mailbox (staging only) ── */
const PRACTICE = [
  { id: 'p1', from: 'Alina Riaz <alina@example.com>', subject: 'Question about your wedding packages', snippet: 'Hi! We are getting married next June and loved your work…', date: new Date(Date.now() - 3600e3).toISOString(), unread: true,
    messages: [{ id: 'p1a', from: 'Alina Riaz <alina@example.com>', to: 'you@example.com', date: new Date(Date.now() - 3600e3).toISOString(), body: 'Hi! We are getting married next June and loved your work. Could you send your packages?\n\nAlina' }] },
  { id: 'p2', from: 'Venue Coordinator <events@example.com>', subject: 'Vendor meal and arrival time', snippet: 'Hello, confirming vendor meals will be served at 7pm…', date: new Date(Date.now() - 86400e3).toISOString(), unread: false,
    messages: [{ id: 'p2a', from: 'Venue Coordinator <events@example.com>', to: 'you@example.com', date: new Date(Date.now() - 86400e3).toISOString(), body: 'Hello, confirming vendor meals will be served at 7pm and load-in is from 2pm.' }] },
];

/** 🔴 unread emails in the inbox (Gmail's own count), cached for a minute; 0 when not connected */
const unreadCache = new Map();
/* 🏷️ Filters (Raj, 2026-10-23): Gmail-style — From, To, Subject, Has the words, Doesn't have, and a Gmail label.
   Each becomes a Gmail search, so it shows old and new matching mail alike; nothing in the mailbox is changed. */
const filtersKey = (v) => `gmail_filters_${Number(v)}`;
const FIELDS = ['from', 'to', 'subject', 'has', 'not', 'label'];
export async function getFilters(v) {
  const raw = await setting(filtersKey(v));
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export async function saveFilters(v, list = []) {
  if (!Array.isArray(list)) throw new Error('Filters must be a list.');
  const clean = list.slice(0, 30).map((f, i) => {
    const o = { id: String(f.id || `f${Date.now().toString(36)}${i}`).slice(0, 40), name: String(f.name || '').trim().slice(0, 40) };
    for (const k of FIELDS) o[k] = String(f[k] || '').replace(/[{}]/g, '').trim().slice(0, 200);
    return o;
  });
  for (const f of clean) {
    if (!f.name) throw new Error('Every filter needs a name.');
    if (!FIELDS.some(k => f[k])) throw new Error(`"${f.name}" needs at least one rule (From, To, Subject, words or label).`);
  }
  await saveSetting(filtersKey(v), JSON.stringify(clean));
  return clean;
}
const phrase = (s) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '')}"` : s);
/** a filter → the Gmail search that finds the same mail */
export function filterQuery(f) {
  const q = [];
  if (f.from) q.push(`from:(${f.from})`);
  if (f.to) q.push(`to:(${f.to})`);
  if (f.subject) q.push(`subject:(${phrase(f.subject)})`);
  if (f.has) q.push(f.has);
  if (f.not) q.push(`-(${f.not})`);
  if (f.label) q.push(`label:${phrase(f.label).replace(/ /g, '-')}`);
  return q.join(' ');
}
/** the vendor's own Gmail labels (for the filter form) */
export async function listLabels(v) {
  if ((await status(v)).sandbox) return ['Inquiries', 'Payments', 'Receipts'];
  const d = await gmail(v, '/labels');
  return (d.labels || []).filter(l => l.type === 'user').map(l => l.name).sort((a, b) => a.localeCompare(b));
}
const practiceMatch = (f, t) => {
  const text = (s) => String(s || '').toLowerCase();
  const all = text(`${t.from} ${t.subject} ${t.snippet}`);
  return (!f.from || text(t.from).includes(text(f.from))) && (!f.subject || text(t.subject).includes(text(f.subject)))
    && (!f.has || all.includes(text(f.has))) && (!f.not || !all.includes(text(f.not)));
};

export async function unreadCount(v) {
  const st = await status(v);
  if (st.sandbox) return PRACTICE.filter(t => t.unread).length;
  if (!st.connected) return 0;
  const hit = unreadCache.get(Number(v));
  if (hit && hit.until > Date.now()) return hit.n;
  const n = Number((await gmail(v, '/labels/INBOX')).threadsUnread || 0);
  unreadCache.set(Number(v), { n, until: Date.now() + 60_000 });
  return n;
}
export const forgetUnread = (v) => unreadCache.delete(Number(v));

/** filter 'all' (the inbox) or one of the vendor's filters; a search narrows either. */
export async function listThreads(v, q = '', filterId = 'all') {
  const f = filterId === 'all' ? null : (await getFilters(v)).find(x => x.id === filterId) || null;
  if ((await status(v)).sandbox) {
    return PRACTICE.filter(t => (!q || `${t.from} ${t.subject} ${t.snippet}`.toLowerCase().includes(q.toLowerCase())) && (!f || practiceMatch(f, t)))
      .map(({ messages, ...t }) => t);
  }
  const base = f ? filterQuery(f) : 'in:inbox';
  const d = await gmail(v, `/threads?maxResults=25&q=${encodeURIComponent(q ? `${base} ${q}` : base)}`);
  const list = await Promise.all((d.threads || []).map(async (t) => {
    const th = await gmail(v, `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    const last = th.messages[th.messages.length - 1], first = th.messages[0];
    return { id: t.id, from: header(last, 'From'), subject: header(first, 'Subject') || '(no subject)', snippet: last.snippet || '',
      date: new Date(Number(last.internalDate)).toISOString(), unread: th.messages.some(m => (m.labelIds || []).includes('UNREAD')), count: th.messages.length };
  }));
  return list;
}

export async function getThread(v, id) {
  if ((await status(v)).sandbox) { const t = PRACTICE.find(x => x.id === id); if (!t) throw new Error('Not found'); t.unread = false; return { id, subject: t.subject, messages: t.messages }; }
  const th = await gmail(v, `/threads/${encodeURIComponent(id)}?format=full`);
  if ((th.messages || []).some(m => (m.labelIds || []).includes('UNREAD'))) forgetUnread(v);
  if ((th.messages || []).some(m => (m.labelIds || []).includes('UNREAD'))) gmail(v, `/threads/${encodeURIComponent(id)}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) }).catch(() => {});
  return { id, subject: header(th.messages[0], 'Subject') || '(no subject)',
    messages: th.messages.map(m => ({ id: m.id, from: header(m, 'From'), to: header(m, 'To'), date: new Date(Number(m.internalDate)).toISOString(),
      messageId: header(m, 'Message-ID'), references: header(m, 'References'), body: bodyOf(m.payload).trim() })) };
}

/** Send a new email, or a reply in a thread (threadId + the message it answers). */
export async function sendEmail(v, { to, subject, body, threadId, replyTo }) {
  const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(to).replace(/.*<([^>]+)>.*/, '$1'))) throw new Error('Enter a valid email address.');
  if (!String(body || '').trim()) throw new Error('Write the message first.');
  if ((await status(v)).sandbox) return { ok: true, sandbox: true };
  const subj = clean(subject) || '(no subject)';
  const head = [`To: ${clean(to)}`, `Subject: =?UTF-8?B?${Buffer.from(subj).toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit'];
  if (replyTo?.messageId) head.push(`In-Reply-To: ${clean(replyTo.messageId)}`, `References: ${clean(`${replyTo.references || ''} ${replyTo.messageId}`)}`);
  const raw = Buffer.from(`${head.join('\r\n')}\r\n\r\n${String(body)}`, 'utf8').toString('base64url');
  const sent = await gmail(v, '/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
  return { ok: true, id: sent.id, threadId: sent.threadId };
}

/* ⏰ inbox threads 1–14 days old whose last message is someone else's (smart reminders); automated senders skipped */
export async function awaitingReply(v) {
  const st = await status(v);
  if (!st.connected || st.sandbox) return [];
  const me = String(st.email || '').toLowerCase();
  const d = await gmail(v, `/threads?maxResults=30&q=${encodeURIComponent('in:inbox older_than:1d newer_than:14d -category:promotions -category:social -category:updates -category:forums')}`);
  const out = [];
  for (const t of d.threads || []) {
    const th = await gmail(v, `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
    const last = th.messages[th.messages.length - 1];
    const from = header(last, 'From');
    const m = from.match(/<([^>]+)>/);
    const addr = (m ? m[1] : from).toLowerCase().trim();
    if (!addr || addr === me || /no-?reply|notifications?@|mailer-daemon|postmaster@/i.test(addr)) continue;
    out.push({ key: t.id, who: from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || addr, contact: addr,
      snippet: `${header(th.messages[0], 'Subject')} — ${last.snippet || ''}`.slice(0, 300), at: new Date(Number(last.internalDate)) });
  }
  return out;
}

const spokenWhen = (d) => new Date(d).toLocaleString('en-US', { timeZone: 'America/Vancouver', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const plainName = (from) => String(from || '').replace(/<[^>]+>/, '').replace(/"/g, '').trim() || from;

/** 🎙️ for Tornado / Gale: the latest emails (optionally one filter, or only unread) — listing marks nothing read */
export async function emailSummary(v, { filterName, unreadOnly } = {}) {
  const st = await status(v);
  if (!st.connected) return { error: 'His email is not connected yet.' };
  const f = filterName ? (await getFilters(v)).find(x => x.name.toLowerCase().includes(String(filterName).toLowerCase())) : null;
  const list = await listThreads(v, unreadOnly ? 'is:unread' : '', f ? f.id : 'all');
  return { filter: f?.name || null, items: list.slice(0, 8).map(t => ({ from: plainName(t.from), subject: t.subject, unread: !!t.unread, when: spokenWhen(t.date) })) };
}

/** 🎙️ read one email out — found by sender or subject words; reading it marks it read in Gmail (his phone matches) */
export async function emailRead(v, who) {
  const st = await status(v);
  const w = String(who || '').replace(/["(){}]/g, '').trim();
  if (!st.connected || !w) return null;
  let id;
  if (st.sandbox) id = PRACTICE.find(t => `${t.from} ${t.subject}`.toLowerCase().includes(w.toLowerCase()))?.id;
  else id = (await gmail(v, `/threads?maxResults=1&q=${encodeURIComponent(`newer_than:60d {from:(${w}) subject:(${w}) "${w}"}`)}`)).threads?.[0]?.id;
  if (!id) return null;
  const t = await getThread(v, id);
  const m = t.messages[t.messages.length - 1];
  return { from: plainName(m.from), subject: t.subject, when: spokenWhen(m.date), body: String(m.body || '').replace(/\n{3,}/g, '\n\n').slice(0, 1500) };
}
