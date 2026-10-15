/**
 * 🧠 The panel operator (Raj, 2026-10-15: "it should be able to do anything I can do in the panel —
 * the way a human would, never by messing with the code — except sending a contract").
 *
 * Tornado hands over a job in plain words ("create an album for Pinky with Mehndi and Reception folders").
 * A Claude model works out the steps and carries them out through the panel's OWN API, as the owner —
 * the same routes the admin panel calls, so every check, limit and tenancy wall applies. It may READ the
 * backend code to learn how a route wants its data; it can never change code or files.
 *
 * Raj's two limits (2026-10-15): a contract is never SENT without his yes (drafting is fine), and code is
 * never changed (no route can). Everything else he could do in the panel is done straight away.
 * Guard rails are code, not instructions — the model cannot talk its way past them:
 *   ✋ his yes first: sending / releasing a contract, and deleting something for good
 *   ❌ never: sign-in and account security, platform-wide (super-admin) settings, billing, the agent's own routes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSetting } from './settings.js';
import { signToken } from '../middleware/auth.js';

/* 🧬 ONE VENDOR, BY CONSTRUCTION (Raj, 2026-10-15: "it should be in the DNA — whoever buys this can't change it").
   Not a rule the model reads — code it cannot reach:
   1. The operator never borrows the caller's login. It mints its own for THIS vendor only, with the role forced
      to "vendor": every admin / super-admin route refuses it, whatever it asks.
   2. Every answer the panel gives it is checked: a record carrying another vendor's id is blocked before the
      model ever sees it.
   3. read_code reads code files only (routes, libs, screens) — never data, never .env or settings. */
const loginFor = (vendorId, userId) => `Bearer ${signToken({ id: Number(userId), role: 'vendor', vendor_id: Number(vendorId) })}`;
function foreignVendor(text, vendorId) {
  for (const m of String(text).matchAll(/"vendor_?[iI]d"\s*:\s*(\d+)/g)) if (Number(m[1]) !== Number(vendorId)) return Number(m[1]);
  return null;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(HERE, '../..');
const API_JS = path.join(BACKEND, '../frontend/src/lib/api.js');
const PORT = process.env.PORT || 3001;

/* ── the guard rails ── */
const NEVER = [
  /^\/(auth|super|admin|billing|subscriptions?|platform|settings\/platform|agent|pc|users|me\/account|me\/password|me\/email)(\/|$)/i,
  /\/features(\/|$)/i,
];
const CONTRACT_OUT = [/contracts?\/[^/]+\/(send|release|resend|email|deliver)/i, /send-contract|release-contract/i];
export function verdict(method, p, body) {
  const m = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return 'never';
  if (!String(p).startsWith('/') || String(p).includes('..')) return 'never';
  if (NEVER.some(r => r.test(p))) return 'never';
  if (m === 'GET') return 'ok';
  if (CONTRACT_OUT.some(r => r.test(p))) return 'yes';     // a contract goes out only after his yes
  if (m === 'DELETE') return 'yes';                         // gone for good — one "shall I?"
  return 'ok';
}

/* ── the map: every action the admin panel can do, read from the panel's own api.js ── */
let CATALOG = null;
function catalog() {
  if (CATALOG) return CATALOG;
  const src = fs.readFileSync(API_JS, 'utf8');
  const out = [];
  const re = /^\s+(\w+):\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\n?\s*request\(\s*([`'"])(.*?)\3(?:\s*,\s*\{([^}]*)\})?/gms;
  let m;
  while ((m = re.exec(src))) {
    const p = m[4].replace(/\$\{([^}]+)\}/g, ':$1');
    const method = (m[5]?.match(/method:\s*['"](\w+)['"]/) || [null, 'GET'])[1].toUpperCase();
    if (verdict(method, p.replace(/:[\w.]+/g, '1'), null) === 'never') continue;
    out.push(`${m[1]}(${m[2].trim()}) → ${method} ${p}`);
  }
  CATALOG = out.join('\n');
  return CATALOG;
}

/** Read-only look at the code — the server's routes and libs, and the panel's own screens — lines around a word, never a write. */
function readCode(file, search) {
  const rel = String(file || '').replace(/\\/g, '/').replace(/^\/+/, '');
  let f;
  if (/^(routes|lib)\/[\w.-]+\.js$/.test(rel)) f = path.join(BACKEND, 'src', rel);
  else if (/^(pages|components)\/[\w.-]+\.jsx?$/.test(rel)) f = path.join(BACKEND, '../frontend/src', rel);   // 🔍 the panel's screens: what each page does and sends
  else return { error: 'Readable: routes/*.js, lib/*.js (server) and pages/*.jsx, components/*.jsx (the panel).' };
  if (!fs.existsSync(f)) return { error: 'No such file' };
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  if (!search) return { lines: lines.length, head: lines.slice(0, 60).join('\n') };
  const hits = [];
  lines.forEach((l, i) => { if (l.includes(search)) hits.push(i); });
  const pieces = hits.slice(0, 4).map(i => lines.slice(Math.max(0, i - 3), i + 30).map((l, k) => `${Math.max(0, i - 3) + k + 1}: ${l}`).join('\n'));
  return { matches: hits.length, code: pieces.join('\n...\n').slice(0, 7000) };
}

const TOOLS = [
  { name: 'api', description: 'Call the iwopo panel API as the owner (the same routes the admin panel uses). path starts after /api, e.g. "/albums".', input_schema: { type: 'object', properties: { method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }, path: { type: 'string' }, body: { type: 'object' } }, required: ['method', 'path'] } },
  { name: 'read_code', description: 'Read the code to learn where things are and what a route expects (read-only). Server: "routes/albums.js", "lib/x.js". The panel\'s screens: "pages/VendorPanel.jsx", "pages/AlbumDetail.jsx" (see what a button sends). search: a word to jump to.', input_schema: { type: 'object', properties: { file: { type: 'string' }, search: { type: 'string' } }, required: ['file'] } },
  { name: 'ask_owner', description: "A step that needs the owner's yes (sending / releasing a contract, or deleting something for good): describe it and stop. The exact call is shown to him as a Yes/No card.", input_schema: { type: 'object', properties: { method: { type: 'string' }, path: { type: 'string' }, body: { type: 'object' }, summary: { type: 'string', description: 'one short line, e.g. "Email Pinky her gallery link"' } }, required: ['method', 'path', 'summary'] } },
];

const SYSTEM = () => `You operate the iwopo admin panel for its owner, exactly as he would by clicking in it, through its own HTTP API (as him). Do the whole job you are given, step by step, then reply with ONE short plain sentence of what you did — include any password, link or name you created (he must hear the password).

Rules:
- Use the panel's own routes only (the map below; read_code shows what a route wants). Never guess field names — check the route.
- Never answer that something can't be done until you have looked: the map, then the panel's screens and routes (read_code). Look things up before changing them (find the album id, the lead id). Never invent data — and never make up a password: if one is needed and not given, stop and say so in your reply.
- Do the job straight away. Only two steps need his yes — call ask_owner with the exact call and stop: sending / releasing a contract (you may create and edit drafts freely), and deleting something for good.
- You never change code (no route can), sign-in / account security, platform-wide settings or billing.
- Answer only what he asked; no extras, no questions at the end.

His words → the panel's places:
- gallery = album = /albums. A folder or tab INSIDE a gallery (Mehndi, Reception, Videos) = an album event: POST /albums/:id/events. A gallery's client link = the site address + /g/ + the album's public_token. Its passwords: GET /albums/:id/passwords; change them with PUT /albums/:id { guest_password, admin_password }.
- File Flyer (the vendor's drive for sharing files) = /files — only when he says File Flyer or drive.
- lead / client / inquiry / booking = /leads. Photo selection = the gallery's selection. Packages = /vendor-packages or /packages.
When a word could mean two places, pick the one that matches what he is talking about (a gallery's folder → the album).

The panel's actions (name(args) → METHOD /path):
${catalog()}`;

/** Run one job. Returns { summary } or { summary, ask: {method, path, body, summary} }. */
export async function operate({ vendorId, userId, task }) {
  if (!Number(vendorId) || !Number(userId)) return { summary: 'No vendor — nothing done.' };
  const auth = loginFor(vendorId, userId);                 // 🧬 its own login: this vendor only, no admin powers
  // 🚀 Haiku first (as Raj asked); if it can't finish the job, the same job again with the stronger model
  const first = await operateWith({ vendorId, auth, task, model: (await getSetting('operator_model', '')) || 'claude-haiku-5-5' });
  const gaveUp = !first.ask && (!(first.steps || []).length && /\b(can't|cannot|couldn't|could not|unable|not able|no way|don't have|isn't possible|not possible|stopped after)\b/i.test(first.summary || ''));
  if (!gaveUp) return first;
  const second = await operateWith({ vendorId, auth, task, model: (await getSetting('operator_strong_model', '')) || 'claude-sonnet-5-5' });
  return { ...second, escalated: true };
}

async function operateWith({ vendorId, auth, task, model }) {
  const key = await getSetting('agent_api_key', '');
  if (!key) return { summary: 'The panel operator needs the AI Agent key.' };
  const messages = [{ role: 'user', content: String(task || '').slice(0, 2000) }];
  const system = [{ type: 'text', text: SYSTEM(), cache_control: { type: 'ephemeral' } }];
  const done = [];
  for (let step = 0; step < 16; step++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1500, system, tools: TOOLS, messages }),
    });
    const d = await r.json();
    if (!r.ok) return { summary: `The operator could not think: ${d.error?.message || r.status}` };
    messages.push({ role: 'assistant', content: d.content });
    if (d.stop_reason !== 'tool_use') {
      return { summary: (d.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ').trim() || 'Done.', steps: done };
    }
    const results = [];
    for (const c of d.content.filter(x => x.type === 'tool_use')) {
      let out;
      if (c.name === 'read_code') out = readCode(c.input.file, c.input.search);
      else if (c.name === 'ask_owner') {
        const v = verdict(c.input.method, c.input.path, c.input.body);
        if (v === 'never') out = { error: 'Not allowed — that is never done by the operator.' };
        else return { summary: (done.length ? `Done so far: ${done.join('; ')}. ` : '') + `Needs your yes: ${c.input.summary}`, ask: { method: String(c.input.method).toUpperCase(), path: c.input.path, body: c.input.body || null, summary: String(c.input.summary).slice(0, 200) }, steps: done };
      } else if (c.name === 'api') {
        const method = String(c.input.method || 'GET').toUpperCase();
        const v = verdict(method, c.input.path, c.input.body);
        if (v === 'never') out = { error: 'Not allowed — that is never done by the operator.' };
        else if (v === 'yes') out = { error: 'This step needs the owner\'s yes — call ask_owner with it instead.' };
        else {
          const res = await fetch(`http://127.0.0.1:${PORT}/api${c.input.path}`, { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(c.input.body || {}) });
          const text = await res.text();
          const other = foreignVendor(text, vendorId);
          if (other) { out = { error: 'Blocked: that answer held another vendor\'s data.' }; console.error(`[operator] blocked vendor ${other} data for vendor ${vendorId} on ${method} ${c.input.path}`); }
          else out = { status: res.status, body: text.slice(0, 6000) };
          if (method !== 'GET' && res.ok) done.push(`${method} ${c.input.path}`);
        }
      } else out = { error: 'Unknown tool' };
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { summary: `Stopped after many steps. Done so far: ${done.join('; ') || 'nothing'}.`, steps: done };
}
