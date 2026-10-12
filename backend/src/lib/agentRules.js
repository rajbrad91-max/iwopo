/**
 * 📜 Tornado's rules, stored per vendor so they can be trained (Raj, 2026-10-12).
 *
 * The rules are what Tornado reads at the start of a conversation and re-reads on every
 * reply, so every word costs on every reply. They start as the sections of the built-in
 * template (tornado.js) and are then kept short by the weekly self-training
 * (agentTraining.js), which reads four weeks of conversation logs — the logs are NEVER
 * sent to Tornado.
 *
 * 🔒 Protected rules can be reworded shorter but never removed: the ones that keep
 * Tornado accurate and safe, and the sections that carry live data ({{…}}).
 */
import prisma from '../config/prisma.js';
import { tornadoPrompt } from './tornado.js';

/** Never removed, whatever the logs say. */
export const PROTECTED = new Set(['who-tornado-is', 'answer-then-stop', 'accuracy', 'always-check-fresh', 'finding-things', 'doing-things', 'goodbye', 'waiting-for-you', 'past-conversations', 'what-you-know', 'the-business-right-now']);

const slug = (t) => String(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** The built-in template, split into rules. */
export function templateRules() {
  return tornadoPrompt().split(/\n\n+/).filter(p => p.trim()).map((p, i) => {
    const text = p.trim();
    let title;
    if (/^You are Tornado/.test(text)) title = 'Who Tornado is';
    else {
      const m = text.match(/^((?:[A-Z][A-Z0-9'&/,-]*\s?)+)/);
      title = m && m[1].trim().length > 2 ? m[1].trim().replace(/\s+[A-Z]$/, '') : text.split(/\s+/).slice(0, 4).join(' ');
      title = title.replace(/,$/, '').toLowerCase().replace(/^\w/, c => c.toUpperCase());
    }
    const key = slug(title);
    return { key, title, text, sort: (i + 1) * 10, protected: PROTECTED.has(key) || /\{\{\w+\}\}/.test(text) };
  });
}

/** The vendor's rules — seeded from the template the first time. */
export async function rulesFor(vendorId) {
  const v = Number(vendorId);
  let rows = await prisma.agent_rules.findMany({ where: { vendor_id: v }, orderBy: { sort: 'asc' } });
  if (!rows.length) {
    await prisma.agent_rules.createMany({ data: templateRules().map(r => ({ vendor_id: v, ...r })), skipDuplicates: true });
    rows = await prisma.agent_rules.findMany({ where: { vendor_id: v }, orderBy: { sort: 'asc' } });
  }
  return rows;
}

/** The rules as one text, ready for {{…}} to be filled in (geminiLive.js). */
export async function rulesText(vendorId) {
  return (await rulesFor(vendorId)).map(r => r.text).join('\n\n');
}
