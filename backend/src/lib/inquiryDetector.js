/**
 * 🧠 Inquiry detector (Raj, 2026-10-23): "I don't want to miss any inquiry at all."
 * Every new inbox conversation is looked at ONCE:
 *  - it matches the rules of a filter that has the detector switched on (e.g. "New Inquiry from…")  → inquiry, no AI
 *  - machine mail (payment notices, app notifications, receipts, codes, the owner's own mail) → not an inquiry, no AI
 *  - otherwise the AI reads sender + subject + opening: a real person writing about THEIR event is an inquiry, and
 *    when it is unsure about such a person it answers YES; other businesses' offers and marketing are not
 * Inquiries appear in that filter's chip, raise a 🔔 notification (which Tornado and Gale read out on waking),
 * and Smart reminders still nag about any left unanswered. The first run looks back 90 days.
 */
import prisma from '../config/prisma.js';
import { getSetting } from './settings.js';
import { gmail, header, status, getFilters, filterQuery } from './inboxGmail.js';

const FIRST_LOOKBACK = 'newer_than:90d', RECENT = 'newer_than:3d';

const AUTOMATED_SENDER = /no-?reply|do-?not-?reply|notify@|notifications?@|mailer|@payments\.|interac|aftershoot|accounts\.google|google\.com|square|stripe|paypal|calendar|support@|billing@|news(letter)?@|marketing@|team@/i;
const AUTOMATED_SUBJECT = /interac e-transfer|e-transfer|receipt|invoice|payment (received|sent)|your order|order confirm|verification code|security alert|left a review|has been (edited|culled)|your album|webinar|newsletter/i;
const machineMail = (fromAddr, subject) => AUTOMATED_SENDER.test(fromAddr) || AUTOMATED_SUBJECT.test(subject);
const KEYWORDS = /inquir|enquir|wedding|engagement|quote|pric|availab|book|package|photograph|videograph|shoot|our event|my event/i;
const ignoreKey = (v) => `inquiry_ignore_${Number(v)}`;
/** senders the owner marked "not an inquiry" */
export async function ignoredSenders(v) {
  const r = await prisma.platform_settings.findUnique({ where: { key: ignoreKey(v) } });
  try { return r ? JSON.parse(r.value) : []; } catch { return []; }
}
const addrOf = (from) => ((String(from || '').match(/<([^>]+)>/) || [])[1] || from || '').toLowerCase().trim();

/** the AI's answer: 'yes', 'no', or null when it could not be asked */
async function aiVerdict(from, subject, text) {
  const key = await getSetting('agent_api_key', '');
  if (!key) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: (await getSetting('agent_model', '')) || 'claude-haiku-5-5', max_tokens: 5, messages: [{ role: 'user', content:
        `This email arrived at a wedding photography / videography / live-streaming business. Answer YES if a real person (a possible or existing client, or someone writing on their behalf) is asking about, arranging or following up on hiring the business for THEIR event — an inquiry, prices, packages, availability, a booking, a quote they want, a question about their shoot. Answer NO for: payment notifications (e-Transfers), app or software notifications, reviews, newsletters and marketing, and other businesses offering the business something (partnerships, referrals, leasing, products, services, quotes they are selling). If a person is writing about their own event and you are unsure, answer YES. Answer only yes or no.\n\nFrom: ${from}\nSubject: ${subject}\n\n${String(text).slice(0, 1200)}` }] }),
    });
    const a = ((await r.json()).content || []).map(x => x.text || '').join('').trim().toLowerCase();
    return a.startsWith('yes') ? 'yes' : a.startsWith('no') ? 'no' : null;
  } catch { return null; }
}
/** decide a new conversation; without an AI answer the word rule decides (never "yes" to everything) */
async function isInquiry(from, subject, text) {
  const v = await aiVerdict(from, subject, text);
  return v ? v === 'yes' : KEYWORDS.test(`${subject} ${text}`);
}

/** one vendor: look at conversations not seen before; keep each conversation's latest time up to date */
export async function scanInquiries(v) {
  const st = await status(v);
  if (!st.connected || st.sandbox) return { checked: 0, found: 0 };
  const me = String(st.email || '').toLowerCase();
  const ignored = new Set(await ignoredSenders(v));
  const detecting = (await getFilters(v)).filter(f => f.ai);
  if (!detecting.length) return { checked: 0, found: 0 };
  const firstRun = !(await prisma.email_inquiries.count({ where: { vendor_id: v } }));
  const window = firstRun ? FIRST_LOOKBACK : RECENT;

  // threads matching a detecting filter's own rules are inquiries without asking the AI
  const byRule = new Set();
  for (const f of detecting) {
    const rules = filterQuery(f);
    if (!rules) continue;
    let page = '';
    do {
      const d = await gmail(v, `/threads?maxResults=100&q=${encodeURIComponent(`${rules} ${window}`)}${page ? `&pageToken=${page}` : ''}`);
      for (const t of d.threads || []) byRule.add(t.id);
      page = d.nextPageToken || '';
    } while (page && byRule.size < 500);
  }

  const known = new Map((await prisma.email_inquiries.findMany({ where: { vendor_id: v }, select: { thread_id: true, last_at: true } })).map(r => [r.thread_id, r]));
  let checked = 0, found = 0, page = '';
  do {
    const d = await gmail(v, `/threads?maxResults=100&q=${encodeURIComponent(`in:inbox ${window}`)}${page ? `&pageToken=${page}` : ''}`);
    for (const t of d.threads || []) {
      const th = await gmail(v, `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
      const first = th.messages[0], last = th.messages[th.messages.length - 1];
      const lastAt = new Date(Number(last.internalDate));
      const had = known.get(t.id);
      if (had) { if (had.last_at.getTime() !== lastAt.getTime()) await prisma.email_inquiries.updateMany({ where: { vendor_id: v, thread_id: t.id }, data: { last_at: lastAt } }); continue; }
      const from = header(first, 'From'), subject = header(first, 'Subject') || '(no subject)';
      const fromAddr = addrOf(from);
      let yes, source;
      if (byRule.has(t.id)) { yes = true; source = 'rule'; }
      else if (fromAddr === me || machineMail(fromAddr, subject) || ignored.has(fromAddr)) { yes = false; source = 'none'; }   // the owner, machine mail, or a sender he ruled out
      else { yes = await isInquiry(from, subject, first.snippet || ''); source = yes ? 'ai' : 'none'; checked++; }
      await prisma.email_inquiries.create({ data: { vendor_id: v, thread_id: t.id, is_inquiry: yes, source, from_addr: from.slice(0, 200), subject: subject.slice(0, 300), last_at: lastAt } });
      if (yes) {
        found++;
        if (!firstRun) await prisma.notifications.create({ data: { vendor_id: v, type: 'email_inquiry', title: `📧 New email inquiry from ${from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || fromAddr}`, body: subject.slice(0, 200) } });
      }
    }
    page = d.nextPageToken || '';
  } while (page && firstRun);
  return { checked, found };
}

/** look again at earlier AI picks with the current rules — only a clear "no" (or machine mail) removes one */
export async function recheckInquiries(v) {
  let removed = 0;
  for (const r of await prisma.email_inquiries.findMany({ where: { vendor_id: Number(v), source: 'ai', is_inquiry: true } })) {
    const no = machineMail(addrOf(r.from_addr), r.subject || '') || (await aiVerdict(r.from_addr, r.subject, '')) === 'no';
    if (no) { await prisma.email_inquiries.update({ where: { id: r.id }, data: { is_inquiry: false, source: 'none' } }); removed++; }
  }
  return removed;
}

/** every vendor whose email is connected */
export async function scanAllInquiries() {
  try {
    for (const s of await prisma.platform_settings.findMany({ where: { key: { startsWith: 'gmail_link_' } }, select: { key: true } })) {
      const v = Number(s.key.slice(11));
      await scanInquiries(v).catch(e => console.error(`[inquiries] vendor ${v}:`, e.message));
    }
  } catch (e) { console.error('[inquiries] scan failed:', e.message); }
}

/** a page of detected inquiries, newest conversation first (page = how many already shown) */
export async function inquiryPage(v, { q = '', page = '' } = {}) {
  const skip = Number(page) || 0;
  const where = { vendor_id: Number(v), is_inquiry: true, ...(q ? { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { from_addr: { contains: q, mode: 'insensitive' } }] } : {}) };   // 🔒 tenancy
  const rows = await prisma.email_inquiries.findMany({ where, orderBy: { last_at: 'desc' }, skip, take: 30, select: { thread_id: true } });
  const more = await prisma.email_inquiries.count({ where }) > skip + rows.length;
  return { ids: rows.map(r => r.thread_id), next: more ? String(skip + rows.length) : null };
}

/** 🚫 the owner says this conversation isn't an inquiry: it leaves the list, and so does everything the AI picked from that sender */
export async function notAnInquiry(v, threadId) {
  const row = await prisma.email_inquiries.findFirst({ where: { vendor_id: Number(v), thread_id: String(threadId) } });   // 🔒 tenancy
  if (!row) return { ok: false };
  const sender = addrOf(row.from_addr);
  await prisma.email_inquiries.update({ where: { id: row.id }, data: { is_inquiry: false, source: 'user' } });
  if (sender) {
    await prisma.email_inquiries.updateMany({ where: { vendor_id: Number(v), source: 'ai', from_addr: { contains: sender, mode: 'insensitive' } }, data: { is_inquiry: false, source: 'user' } });
    const list = await ignoredSenders(v);
    if (!list.includes(sender)) {
      const value = JSON.stringify([...list, sender].slice(-500));
      await prisma.platform_settings.upsert({ where: { key: ignoreKey(v) }, create: { key: ignoreKey(v), value }, update: { value } });
    }
  }
  return { ok: true, sender };
}
