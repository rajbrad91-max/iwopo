/**
 * 🧠 Tornado's self-training (Raj, 2026-10-12): "keep a full log of four weeks of
 * conversations and use it to update the rules — keep them as short as possible
 * without losing the important ones. I am not going to review them."
 *
 * Once a week (and on "Train now") a stronger text model reads the logs — every
 * conversation transcript of the last 28 days and every tool Tornado used, with its
 * errors — plus the current rules and the owner's lessons, and returns changes:
 * shorten, merge, remove a rule nobody needs, or add one for a mistake that keeps
 * happening. Changes are applied automatically once they pass the safety checks:
 *   • a 🔒 protected rule is never removed; it can only be reworded SHORTER and must
 *     keep every tool name and {{…}} it had;
 *   • every rule keeps its {{…}} live-data slots;
 *   • the whole set may NEVER grow: an addition must be paid for by cuts elsewhere (Raj:
 *     "the whole point is to burn as few tokens as possible");
 *   • the trainer reads only the conversations since its last run, with a cheap model,
 *     and skips the week when fewer than 5 new conversations happened;
 *   • every change is kept in history — "Undo last training" puts them all back.
 * Tornado never reads the logs: they cost nothing on its replies.
 */
import prisma from '../config/prisma.js';
import { getSetting } from './settings.js';
import { rulesFor } from './agentRules.js';

const DAYS = 28;
const TZ = 'America/Vancouver';
const vars = (t) => new Set(String(t).match(/\{\{\w+\}\}/g) || []);
const toolNames = (t) => new Set(String(t).match(/\b[a-z]+(?:_[a-z]+)+\b/g) || []);
const slug = (t) => String(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Four weeks of what happened — for the trainer only. */
async function gatherLogs(v, newSince) {
  const since = new Date(Date.now() - DAYS * 86400e3);
  const from = newSince && newSince > since ? newSince : since;
  const convs = await prisma.agent_conversations.findMany({ where: { vendor_id: v, created_at: { gte: from } }, orderBy: { created_at: 'desc' }, select: { created_at: true, transcript: true, summary: true } });
  const tools = await prisma.agent_tool_log.findMany({ where: { vendor_id: v, at: { gte: since } }, select: { tool: true, error: true, args: true, result: true, at: true } });
  const counts = {};
  for (const t of tools) { const c = (counts[t.tool] ||= { used: 0, errors: 0 }); c.used++; if (t.error) c.errors++; }
  const errors = tools.filter(t => t.error).slice(-40).map(t => `${t.at.toISOString().slice(0, 16)} ${t.tool}(${String(t.args).slice(0, 120)}) → ${String(t.result).slice(0, 160)}`);
  let budget = 80_000;                                                    // characters of transcripts, newest first
  const talks = [];
  for (const c of convs) {
    const t = c.transcript || c.summary || '';
    if (budget - t.length < 0) break;
    budget -= t.length;
    talks.push(`--- ${new Date(c.created_at).toLocaleString('en-CA', { timeZone: TZ })}\n${t}`);
  }
  return { conversations: convs.length, used: talks.length, talks: talks.join('\n'), counts, errors };
}

/** Ask the trainer for changes (JSON). */
async function proposeChanges(rules, lessons, logs) {
  const key = await getSetting('agent_api_key', '');
  if (!key) throw new Error('Training needs the AI Agent key (Super Admin → Settings → AI Agent).');
  const prompt = `You maintain the RULES of "Tornado", a voice assistant for a wedding photography business. Tornado re-reads every rule on EVERY reply, so each word costs money. Your job: make the rules SHORTER while keeping Tornado just as smart, accurate and safe. The total length of all rules MUST end shorter than now (or unchanged if nothing can go).

You get: the current rules (key, protected, text), the owner's lessons, how often each tool was used in the last ${DAYS} days, tool errors, and the conversation transcripts ("Owner:" / "Tornado:").

Propose changes, judged ONLY from evidence in the logs:
- "edit": reword a rule shorter (same meaning), or fix it where Tornado misbehaved in the logs.
- "remove": a rule whose situation never came up AND is not needed for safety (never a protected one).
- "add": ONLY for a mistake that clearly repeats in the logs, and only if it cannot be folded into an existing rule with an "edit" (prefer that). Any added words must be paid for by cutting more elsewhere in the same reply.
Never remove or weaken: accuracy, acting only after the owner's yes, never sending contracts, answering briefly. Keep every {{placeholder}} and tool name exactly as written. Write rules about behaviour, never about specific clients — no client names.
If nothing needs changing, return no changes.

Answer by calling propose_rule_changes (an empty list if nothing should change).

CURRENT RULES:
${JSON.stringify(rules.map(r => ({ key: r.key, protected: r.protected, text: r.text })), null, 1)}

OWNER'S LESSONS:
${lessons.map(l => `- ${l}`).join('\n') || '(none)'}

TOOLS USED (last ${DAYS} days): ${JSON.stringify(logs.counts)}
TOOL ERRORS:
${logs.errors.join('\n') || '(none)'}

CONVERSATIONS (${logs.used} of ${logs.conversations}, newest first):
${logs.talks || '(none yet)'}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: (await getSetting('training_model', '')) || 'claude-haiku-5-5', max_tokens: 3000,
      // a strict form instead of free text: the answer can't come back as broken JSON
      tools: [{
        name: 'propose_rule_changes',
        description: 'The changes to make to the rules.',
        input_schema: {
          type: 'object',
          properties: {
            changes: { type: 'array', items: { type: 'object', properties: {
              action: { type: 'string', enum: ['edit', 'remove', 'add'] },
              key: { type: 'string', description: 'the rule key (for add: a new short key)' },
              title: { type: 'string', description: 'for add only' },
              text: { type: 'string', description: 'the full new text (edit / add)' },
              reason: { type: 'string', description: 'one line, with the evidence' },
            }, required: ['action', 'key', 'reason'] } },
            summary: { type: 'string', description: 'one short line for the owner' },
          },
          required: ['changes', 'summary'],
        },
      }],
      tool_choice: { type: 'tool', name: 'propose_rule_changes' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || `trainer ${r.status}`);
  const out = (d.content || []).find(c => c.type === 'tool_use')?.input || { changes: [], summary: 'No answer from the trainer' };
  const u = d.usage || {};
  return { ...out, cost: ((u.input_tokens || 0) * 0.10 + (u.output_tokens || 0) * 0.50) / 1e6 };   // Haiku 5.5 prices ($0.10 / $0.50 per million)
}

/** Keep only the changes that pass every safety check. */
function vet(rules, changes, maxGrowth = 0) {
  const byKey = new Map(rules.map(r => [r.key, r]));
  const ok = [], refused = [];
  let growth = 0, adds = 0;
  for (const c of Array.isArray(changes) ? changes : []) {
    const r = byKey.get(c.key);
    const no = (why) => refused.push({ ...c, why });
    if (c.action === 'remove') {
      if (!r) { no('no such rule'); continue; }
      if (r.protected) { no('protected'); continue; }
      growth -= r.text.length; ok.push(c); continue;
    }
    const text = String(c.text || '').trim();
    if (!text) { no('empty'); continue; }
    if (/\b(Yuffie|Pinky|Sanjeev|Anmol|Amrit|Jerry)\b/.test(text)) { no('mentions a client'); continue; }
    if (c.action === 'edit') {
      if (!r) { no('no such rule'); continue; }
      const lostVar = [...vars(r.text)].find(x => !text.includes(x));
      if (lostVar) { no(`would lose ${lostVar}`); continue; }
      if (r.protected) {
        const lostTool = [...toolNames(r.text)].find(x => !text.includes(x));
        if (lostTool) { no(`would lose ${lostTool}`); continue; }
      }
      growth += text.length - r.text.length; ok.push({ ...c, text }); continue;
    }
    if (c.action === 'add') {
      if (++adds > 2 || text.length > 400) { no('too many / too long'); continue; }
      growth += text.length; ok.push({ ...c, key: slug(c.key || c.title || text.slice(0, 30)), text }); continue;
    }
    no('unknown action');
  }
  if (growth > maxGrowth) return { ok: [], refused: [...refused, ...ok.map(c => ({ ...c, why: `the rules would grow by ${growth} characters` }))] };
  return { ok, refused };
}

/** Write vetted changes to the rules, each kept in the history (undo). */
async function applyChanges(v, rules, ok, runId) {
  let sort = Math.max(...rules.map(r => r.sort), 0);
  for (const c of ok) {
    const r = rules.find(x => x.key === c.key);
    if (c.action === 'remove') {
      await prisma.agent_rule_history.create({ data: { vendor_id: v, run_id: runId, key: r.key, title: r.title, action: 'remove', old_text: r.text, new_text: null, reason: c.reason || '', protected: r.protected, sort: r.sort } });
      await prisma.agent_rules.delete({ where: { id: r.id } });
    } else if (c.action === 'edit') {
      await prisma.agent_rule_history.create({ data: { vendor_id: v, run_id: runId, key: r.key, title: r.title, action: 'edit', old_text: r.text, new_text: c.text, reason: c.reason || '', protected: r.protected, sort: r.sort } });
      await prisma.agent_rules.update({ where: { id: r.id }, data: { text: c.text, updated_at: new Date() } });
    } else {
      sort += 10;
      const title = String(c.title || c.key).slice(0, 80);
      await prisma.agent_rules.upsert({ where: { vendor_id_key: { vendor_id: v, key: c.key } }, create: { vendor_id: v, key: c.key, title, text: c.text, sort, protected: false }, update: { text: c.text } });
      await prisma.agent_rule_history.create({ data: { vendor_id: v, run_id: runId, key: c.key, title, action: 'add', old_text: null, new_text: c.text, reason: c.reason || '', protected: false, sort } });
    }
  }
}

/* 📝 A lesson the owner gives Tornado ("make a note…") is NOT read by Tornado (Raj, 2026-10-12:
   "lessons are my notes"). Right after it is saved, a cheap model sorts it:
     • behaviour Tornado can change → folded into the rules as the smallest possible edit
       (a few words in an existing rule; a new rule only if nothing fits) → kind 'in_rules';
     • a bug or missing feature → kind 'note', a note for the developer (Claude);
     • already covered by the rules → kind 'in_rules', nothing added.
   Tornado reads only the rules; the lesson stays on the Knowledge page as the owner's note. */
export async function foldLesson(vendorId, memoryId) {
  const v = Number(vendorId);
  const m = await prisma.agent_memory.findFirst({ where: { id: Number(memoryId), vendor_id: v } });
  const key = await getSetting('agent_api_key', '');
  if (!m || !key) return null;
  const rules = await rulesFor(v);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: (await getSetting('training_model', '')) || 'claude-haiku-5-5', max_tokens: 1200,
      tools: [{
        name: 'sort_lesson', description: 'Where this note belongs.',
        input_schema: { type: 'object', properties: {
          type: { type: 'string', enum: ['behaviour', 'for_developer', 'already_covered'] },
          changes: { type: 'array', items: { type: 'object', properties: { action: { type: 'string', enum: ['edit', 'add'] }, key: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, reason: { type: 'string' } }, required: ['action', 'key', 'text', 'reason'] } },
        }, required: ['type', 'changes'] },
      }],
      tool_choice: { type: 'tool', name: 'sort_lesson' },
      messages: [{ role: 'user', content: `The owner of a wedding photography business said this to his voice assistant "Tornado": "${m.text}"

Decide where it belongs:
- "behaviour": how Tornado should talk or act, which its rules can fix. Give the SMALLEST change: prefer an "edit" that adds a few words to the existing rule it fits (return that rule's full new text, keeping every {{placeholder}} and tool name); "add" a new rule only if nothing fits. As short as possible, no client names. Tornado re-reads the rules on every reply, so every word costs.
- "for_developer": a bug, a missing feature, or something Tornado's tools cannot do — no changes.
- "already_covered": the rules already say this — no changes.

THE RULES:
${JSON.stringify(rules.map(x => ({ key: x.key, text: x.text })), null, 1)}` }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  const out = (d.content || []).find(c => c.type === 'tool_use')?.input;
  if (!out) return null;
  let applied = 0;
  if (out.type === 'behaviour') {
    const { ok } = vet(rules, (out.changes || []).map(c => ({ ...c, reason: `Lesson: "${m.text.slice(0, 120)}"` })), 250);
    await applyChanges(v, rules, ok, null);
    applied = ok.length;
  }
  const kind = out.type === 'for_developer' ? 'note' : (out.type === 'behaviour' && !applied ? 'lesson' : 'in_rules');
  await prisma.agent_memory.update({ where: { id: m.id }, data: { kind } });
  return { type: out.type, applied, kind };
}

/** One training run. */
export async function runTraining(vendorId, { manual = false } = {}) {
  const v = Number(vendorId);
  const rules = await rulesFor(v);
  const before = rules.reduce((n, r) => n + r.text.length, 0);
  const prev = await prisma.agent_training_runs.findFirst({ where: { vendor_id: v, status: 'done' }, orderBy: { id: 'desc' }, select: { at: true } });
  const logs = await gatherLogs(v, prev?.at);
  if (!manual && logs.conversations < 5) return { summary: 'Skipped — fewer than 5 new conversations', changes: 0, refused: 0, chars_before: before, chars_after: before };
  const run = await prisma.agent_training_runs.create({ data: { vendor_id: v, status: 'running', manual } });
  try {
    const lessons = (await prisma.agent_memory.findMany({ where: { vendor_id: v, kind: 'lesson' }, select: { text: true } })).map(l => l.text);
    const p = await proposeChanges(rules, lessons, logs);
    const { ok, refused } = vet(rules, p.changes);
    await applyChanges(v, rules, ok, run.id);
    const after = (await rulesFor(v)).reduce((n, r) => n + r.text.length, 0);
    const summary = ok.length ? `${p.summary || 'Rules updated'} (${ok.length} change${ok.length > 1 ? 's' : ''}${refused.length ? `, ${refused.length} refused by the safety checks` : ''})` : (refused.length ? `No change — ${refused.length} suggestion(s) refused by the safety checks` : 'No change needed');
    await prisma.agent_training_runs.update({ where: { id: run.id }, data: { status: 'done', summary, chars_before: before, chars_after: after, conversations: logs.conversations, cost_usd: p.cost, refused: JSON.stringify(refused).slice(0, 8000) } });
    return { summary, changes: ok.length, refused: refused.length, chars_before: before, chars_after: after };
  } catch (e) {
    await prisma.agent_training_runs.update({ where: { id: run.id }, data: { status: 'failed', summary: String(e.message).slice(0, 400) } });
    throw e;
  }
}

/** ↩️ Put back everything the last applied training changed. */
export async function undoLastTraining(vendorId) {
  const v = Number(vendorId);
  const run = await prisma.agent_training_runs.findFirst({ where: { vendor_id: v, status: 'done', undone_at: null, chars_after: { not: null } }, orderBy: { id: 'desc' } });
  if (!run) return { undone: false, message: 'Nothing to undo.' };
  const hist = await prisma.agent_rule_history.findMany({ where: { vendor_id: v, run_id: run.id }, orderBy: { id: 'desc' } });
  for (const h of hist) {
    if (h.action === 'add') await prisma.agent_rules.deleteMany({ where: { vendor_id: v, key: h.key } });
    else if (h.action === 'edit') await prisma.agent_rules.updateMany({ where: { vendor_id: v, key: h.key }, data: { text: h.old_text } });
    else if (h.action === 'remove') await prisma.agent_rules.upsert({ where: { vendor_id_key: { vendor_id: v, key: h.key } }, create: { vendor_id: v, key: h.key, title: h.title, text: h.old_text, sort: h.sort, protected: h.protected }, update: { text: h.old_text } });
  }
  await prisma.agent_training_runs.update({ where: { id: run.id }, data: { undone_at: new Date() } });
  return { undone: true, message: `Undid ${hist.length} change${hist.length === 1 ? '' : 's'} from ${run.at.toDateString()}.` };
}

/** 🗓️ Weekly, Sunday 3–4 AM Vancouver, for every vendor whose Tornado talked in the last four weeks; and the 28-day clean-up. */
export async function weeklyTraining() {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const since = new Date(Date.now() - DAYS * 86400e3);
  // clean-up: tool log and full transcripts older than four weeks (the short summaries stay for Tornado's memory)
  await prisma.agent_tool_log.deleteMany({ where: { at: { lt: since } } }).catch(() => {});
  await prisma.agent_conversations.updateMany({ where: { created_at: { lt: since }, transcript: { not: null } }, data: { transcript: null } }).catch(() => {});
  if (local.getDay() !== 0 || local.getHours() !== 3) return;
  const vendors = await prisma.agent_conversations.groupBy({ by: ['vendor_id'], where: { created_at: { gte: since } } });
  for (const { vendor_id } of vendors) {
    const last = await prisma.agent_training_runs.findFirst({ where: { vendor_id, manual: false }, orderBy: { id: 'desc' } });
    if (last && Date.now() - new Date(last.at) < 6 * 86400e3) continue;
    await runTraining(vendor_id).catch(e => console.error('[agent] training', vendor_id, e.message));
  }
}
