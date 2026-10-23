/**
 * 🧠 Inquiry detector (Raj, 2026-10-23): "I don't want to miss any inquiry at all."
 * Every new inbox conversation is looked at ONCE:
 *  - it matches the rules of a filter that has the detector switched on (e.g. "New Inquiry from…")  → inquiry, no AI
 *  - otherwise the AI reads sender + subject + opening and answers yes/no — told that when unsure, the answer is YES
 * Inquiries appear in that filter's chip, raise a 🔔 notification (which Tornado and Gale read out on waking),
 * and Smart reminders still nag about any left unanswered. The first run looks back 90 days.
 */
import prisma from '../config/prisma.js';
import { getSetting } from './settings.js';
import { gmail, header, status, getFilters, filterQuery } from './inboxGmail.js';

const FIRST_LOOKBACK = 'newer_than:90d', RECENT = 'newer_than:3d';

async function aiSaysInquiry(from, subject, text) {
  const key = await getSetting('agent_api_key', '');
  if (!key) return /inquir|enquir|wedding|engagement|quote|pric|availab|book|package|photograph|videograph|shoot|event/i.test(`${subject} ${text}`);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: (await getSetting('agent_model', '')) || 'claude-haiku-5-5', max_tokens: 5, messages: [{ role: 'user', content:
        `This email arrived at a wedding photography / videography / live-streaming business. Is it from a person (a possible or existing client, or someone on their behalf) asking about, arranging or following up on the business's services — an inquiry, quote, prices, availability, booking, packages, a shoot, a question about their event? Answer NO only for clearly unrelated mail: newsletters, marketing, companies selling to the business, receipts, payment notices, automated notifications. When unsure, answer YES. Answer only yes or no.\n\nFrom: ${from}\nSubject: ${subject}\n\n${String(text).slice(0, 1200)}` }] }),
    });
    const d = await r.json();
    const a = (d.content || []).map(x => x.text || '').join('').trim().toLowerCase();
    return !a.startsWith('no');   // anything but a clear "no" counts — never miss one
  } catch { return true; }
}

/** one vendor: look at conversations not seen before; keep each conversation's latest time up to date */
export async function scanInquiries(v) {
  const st = await status(v);
  if (!st.connected || st.sandbox) return { checked: 0 };
  const me = String(st.email || '').toLowerCase();
  const detecting = (await getFilters(v)).filter(f => f.ai);
  if (!detecting.length) return { checked: 0 };
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
      const fromAddr = ((from.match(/<([^>]+)>/) || [])[1] || from).toLowerCase().trim();
      let yes, source;
      if (byRule.has(t.id)) { yes = true; source = 'rule'; }
      else if (fromAddr === me) { yes = false; source = 'none'; }                  // started by the owner himself
      else { yes = await aiSaysInquiry(from, subject, first.snippet || ''); source = yes ? 'ai' : 'none'; checked++; }
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
