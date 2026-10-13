/**
 * 🎙️ Tornado's recorded lines (Raj, 2026-10-13): greetings and "what's new" are played by the
 * app from short recordings in Tornado's OWN voice — no Gemini turn on a wake-up, so the
 * ~6,500-token start-up read is not spent just to say hello.
 *
 *   recordClips(vendorId)  — once (and again if a line is added): Gemini Live, same model and
 *                            voice as Tornado, says each line; the audio is trimmed, levelled and
 *                            stored (24 kHz 16-bit mono PCM — the format the app already plays).
 *   whatsNew(vendorId)     — on every wake-up: the same unseen items as before (unopened leads,
 *                            unseen texts/calls/bell items, shoots within their daily limits,
 *                            reminders due), as a list of clip keys + the names for the screen.
 *                            A database read — no AI, no tokens.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import privateDb from '../config/privateDb.js';
import { getSetting } from './settings.js';

const BASE = process.env.STORAGE_BASE || '/var/www/iwopo/storage';
const TZ = 'America/Vancouver';
const dirFor = (v) => path.join(BASE, 'voice', String(Number(v)));

/* ── the lines ── */
const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TYPES = {
  lead: ['a new lead', 'new leads'],
  message: ['a new message', 'new messages'],
  call: ['a missed call', 'missed calls'],
  notification: ['a new notification', 'new notifications'],
  email: ['a new email', 'new emails'],
  instagram: ['a new Instagram message', 'new Instagram messages'],
  shoot_today: ['a shoot today', 'shoots today'],
  shoot_tomorrow: ['a shoot tomorrow', 'shoots tomorrow'],
  shoot_week: ['a shoot this week', 'shoots this week'],
  reminder: ['a reminder due today', 'reminders due today'],
};
export function clipLines(name) {
  const lines = {
    yes: `Yes, ${name}?`,
    hey: `Hey ${name}.`,
    morning: `Good morning, ${name}.`,
    afternoon: `Good afternoon, ${name}.`,
    evening: `Good evening, ${name}.`,
    help: `Hey ${name}, how can I help?`,
    you_have: 'You have',
    and: 'and',
  };
  for (const [t, [one, many]] of Object.entries(TYPES)) {
    lines[`${t}_1`] = one;
    for (let n = 2; n <= 9; n++) lines[`${t}_${n}`] = `${WORDS[n]} ${many}`;
    lines[`${t}_10`] = `ten or more ${many}`;
  }
  return lines;
}

/* ── recording: Gemini Live says each line in Tornado's voice ── */
function trimAndLevel(pcm) {
  const s = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const loud = 600;                                              // ~-35 dB
  let a = 0, b = s.length - 1;
  while (a < s.length && Math.abs(s[a]) < loud) a++;
  while (b > a && Math.abs(s[b]) < loud) b--;
  // Raj, 2026-10-13: the ends sounded clipped — keep the word's natural tail, then fade it out softly
  const ms = (x) => Math.round(24000 * x / 1000);
  a = Math.max(0, a - ms(30)); b = Math.min(s.length - 1, b + ms(220));
  const out = s.slice(a, b + 1);
  let peak = 1;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  const gain = Math.min(3, (32767 * 0.7) / peak);                // the same loudness for every clip
  const fadeIn = Math.min(ms(10), out.length), fadeOut = Math.min(ms(120), out.length);
  for (let i = 0; i < out.length; i++) {
    let g = gain;
    if (i < fadeIn) g *= 0.5 - 0.5 * Math.cos(Math.PI * i / fadeIn);                                   // no click at the start
    const left = out.length - 1 - i;
    if (left < fadeOut) g *= 0.5 - 0.5 * Math.cos(Math.PI * left / fadeOut);                           // a soft ending
    out[i] = Math.max(-32768, Math.min(32767, Math.round(out[i] * g)));
  }
  return Buffer.from(out.buffer);
}

async function sayLines(lines) {
  const key = await getSetting('gemini_api_key', '');
  const voice = (await getSetting('gemini_voice', '')) || 'Charon';
  const model = (await getSetting('gemini_live_model', '')) || 'gemini-3.1-flash-live-preview';
  if (!key) throw new Error('No Gemini key');
  const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`);
  const out = {};
  await new Promise((resolve, reject) => {
    const queue = Object.entries(lines);
    let current = null, chunks = [], said = '';
    const next = () => {
      current = queue.shift();
      if (!current) { ws.close(); resolve(); return; }
      chunks = []; said = '';
      ws.send(JSON.stringify({ realtimeInput: { text: current[1] } }));
    };
    ws.onopen = () => ws.send(JSON.stringify({ setup: {
      model: `models/${model}`,
      outputAudioTranscription: {},
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }, thinkingConfig: { thinkingLevel: 'low' } },
      systemInstruction: { parts: [{ text: 'You are a voice recorder. Each message is one line. Say EXACTLY that line — every word, nothing added, nothing left out — warm, relaxed and natural, the way a capable assistant speaks to their boss. A line ending in "?" is a friendly question; a short fragment ("You have", "and", "two new messages") is said as part of a sentence that continues, without a falling, final tone.' }] },
    } }));
    ws.onmessage = async (ev) => {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString());
      if (m.setupComplete) { next(); return; }
      for (const p of m.serverContent?.modelTurn?.parts || []) if (p.inlineData?.data) chunks.push(Buffer.from(p.inlineData.data, 'base64'));
      if (m.serverContent?.outputTranscription?.text) said += m.serverContent.outputTranscription.text;
      if (m.serverContent?.turnComplete && current) {
        // ✅ only a clip that says exactly its line is kept — anything added or dropped is recorded again (up to 3 tries)
        const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        if (norm(said) === norm(current[1]) || (current.tries || 0) >= 2) {
          if (norm(said) !== norm(current[1])) out.__mismatch = [...(out.__mismatch || []), `${current[0]}: "${said.trim()}"`];
          out[current[0]] = trimAndLevel(Buffer.concat(chunks));
          next();
        } else {
          current.tries = (current.tries || 0) + 1;
          chunks = []; said = '';
          ws.send(JSON.stringify({ realtimeInput: { text: current[1] } }));
        }
      }
    };
    ws.onerror = (e) => reject(new Error(`recording: ${e.message || 'socket error'}`));
    ws.onclose = (e) => { if (queue.length || current) { if (e.code !== 1000) reject(new Error(`recording closed: ${e.code} ${e.reason || ''}`)); } };
    setTimeout(() => reject(new Error('recording timed out')), 15 * 60_000);
  });
  return out;
}

/** Record every line (or only the missing ones) for this vendor; writes the manifest. */
export async function recordClips(vendorId, { force = false, only = null } = {}) {
  const v = Number(vendorId);
  const name = (await getSetting('tornado_call_me', '')) || 'there';
  const all = clipLines(name);
  const dir = dirFor(v);
  fs.mkdirSync(dir, { recursive: true });
  const want = Object.fromEntries(Object.entries(all).filter(([k]) => (only ? only.includes(k) : true) && (force || !fs.existsSync(path.join(dir, `${k}.pcm`)))));
  const got = Object.keys(want).length ? await sayLines(want) : {};
  const mismatch = got.__mismatch || [];
  delete got.__mismatch;
  for (const [k, pcm] of Object.entries(got)) fs.writeFileSync(path.join(dir, `${k}.pcm`), pcm);
  const keys = Object.keys(all).filter(k => fs.existsSync(path.join(dir, `${k}.pcm`)));
  const version = crypto.createHash('sha256').update(keys.map(k => `${k}:${fs.statSync(path.join(dir, `${k}.pcm`)).size}`).join('|')).digest('hex').slice(0, 12);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version, name, lines: Object.fromEntries(keys.map(k => [k, all[k]])) }));
  return { recorded: Object.keys(got).length, total: keys.length, version, mismatch };
}

export function clipManifest(vendorId) {
  try { return JSON.parse(fs.readFileSync(path.join(dirFor(vendorId), 'manifest.json'), 'utf8')); } catch { return null; }
}
export function clipFile(vendorId, key) {
  if (!/^[a-z_]+\d*$/.test(String(key))) return null;            // a clip name, never a path
  const f = path.join(dirFor(vendorId), `${key}.pcm`);
  return fs.existsSync(f) ? f : null;
}

/* ── what's new, as clips (the same items, rules and daily limits as the spoken list) ── */
const vDay = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const daysAway = (d) => Math.round((new Date(new Date(d).toISOString().slice(0, 10) + 'T00:00:00Z') - new Date(vDay() + 'T00:00:00Z')) / 86400e3);
const when = (d) => new Date(d).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });

export async function whatsNew(vendorId, { record = true } = {}) {
  const v = Number(vendorId);
  const items = {}, names = [];
  const bump = (type, line) => { items[type] = (items[type] || 0) + 1; if (line) names.push(line); };

  for (const l of await prisma.leads.findMany({ where: { vendor_id: v, archived_at: null, seen_at: null, created_at: { gte: new Date(Date.now() - 30 * 86400e3) } }, orderBy: { created_at: 'desc' }, take: 20, select: { name: true, event_type: true, created_at: true } }))
    bump('lead', `🆕 Lead: ${l.name}${l.event_type ? ` (${l.event_type})` : ''} · ${when(l.created_at)}`);
  for (const c of await privateDb.comms_notices.findMany({ where: { vendor_id: v, seen_at: null, created_at: { gte: new Date(Date.now() - 7 * 86400e3) } }, orderBy: { created_at: 'desc' }, take: 20, select: { title: true, created_at: true } }).catch(() => []))
    bump(/call/i.test(c.title) ? 'call' : 'message', `${/call/i.test(c.title) ? '📞' : '💬'} ${c.title} · ${when(c.created_at)}`);
  for (const n of await prisma.notifications.findMany({ where: { vendor_id: v, seen_at: null, type: { not: 'lead' }, created_at: { gte: new Date(Date.now() - 14 * 86400e3) } }, orderBy: { created_at: 'desc' }, take: 20, select: { title: true } }))
    bump('notification', `🔔 ${String(n.title).replace(/\$\s?[\d,]+(\.\d+)?/g, '(amount on request)')}`);

  // shoots and reminders within their daily limits (agent_notices — the same counters as before)
  const day = vDay();
  const allowed = async (key, limit) => {
    const row = await prisma.agent_notices.findUnique({ where: { vendor_id_day_key: { vendor_id: v, day, key } } });
    if ((row?.count || 0) >= limit) return false;
    if (record) await prisma.agent_notices.upsert({ where: { vendor_id_day_key: { vendor_id: v, day, key } }, create: { vendor_id: v, day, key, count: 1 }, update: { count: { increment: 1 } } });
    return true;
  };
  for (const e of await prisma.leads.findMany({ where: { vendor_id: v, archived_at: null, status: { not: 'lost' }, event_date: { gte: new Date(Date.now() - 86400e3), lte: new Date(Date.now() + 8 * 86400e3) } }, orderBy: { event_date: 'asc' }, take: 12, select: { id: true, name: true, event_type: true, event_date: true, timing_from: true, location: true } })) {
    const d = daysAway(e.event_date);
    if (d < 0 || d > 7 || !(await allowed(`event:${e.id}`, d <= 2 ? 3 : 1))) continue;
    bump(d === 0 ? 'shoot_today' : d === 1 ? 'shoot_tomorrow' : 'shoot_week', `📅 ${e.name}'s ${e.event_type || 'event'} · ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : new Date(e.event_date).toDateString()}${e.timing_from ? ` ${e.timing_from}` : ''}${e.location ? ` · ${e.location}` : ''}`);
  }
  for (const r of await prisma.agent_reminders.findMany({ where: { vendor_id: v, done_at: null, kind: { not: 'alarm' }, due_at: { lte: new Date(Date.now() + 86400e3) } }, take: 8, select: { id: true, title: true } })) {
    if (!(await allowed(`reminder:${r.id}`, 3))) continue;
    bump('reminder', `⏰ ${r.title}`);
  }

  // the greeting: carrying on a conversation of the last 20 minutes, or the time of day
  const last = await prisma.agent_conversations.findFirst({ where: { vendor_id: v }, orderBy: { created_at: 'desc' }, select: { created_at: true } });
  const continuing = last && Date.now() - new Date(last.created_at) < 20 * 60_000;
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }));
  const greet = continuing ? 'yes' : hour >= 4 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 23 ? 'evening' : 'hey';

  const order = ['lead', 'message', 'call', 'email', 'instagram', 'notification', 'shoot_today', 'shoot_tomorrow', 'shoot_week', 'reminder'];
  const parts = order.filter(t => items[t]).map(t => `${t}_${Math.min(items[t], 10)}`);
  const seq = [greet];
  if (parts.length && !continuing) {
    seq.push('you_have', ...parts.slice(0, -1));
    if (parts.length > 1) seq.push('and');
    seq.push(parts[parts.length - 1]);
  }
  if (record) countPlays(v, seq);
  const m = clipManifest(v);
  const text = seq.map(k => m?.lines?.[k] || k).join(' ').replace(/ ([.?])/g, '$1');
  return { sequence: seq, text, names: continuing ? [] : names, continuing: !!continuing, version: m?.version || null };
}

/* 🎙️ the voice bank page: every line, how often it was played, and what that saved */
const playsFile = (v) => path.join(dirFor(v), 'plays.json');
function countPlays(v, seq) {
  let p;
  try { p = JSON.parse(fs.readFileSync(playsFile(v), 'utf8')); } catch { p = { _since: new Date().toISOString().slice(0, 10) }; }
  p._wakeups = (p._wakeups || 0) + 1;
  for (const k of seq) p[k] = (p[k] || 0) + 1;
  try { fs.writeFileSync(playsFile(v), JSON.stringify(p)); } catch { /* counting is best effort */ }
}
export function voiceBank(vendorId) {
  const v = Number(vendorId);
  const m = clipManifest(v);
  if (!m) return { clips: [], wakeups: 0, since: null };
  let p = {};
  try { p = JSON.parse(fs.readFileSync(playsFile(v), 'utf8')); } catch { /* nothing played yet */ }
  const clips = Object.entries(m.lines).map(([key, text]) => {
    const f = clipFile(v, key);
    const bytes = f ? fs.statSync(f).size : 0;
    return { key, text, seconds: Math.round(bytes / 48000 * 10) / 10, plays: p[key] || 0 };
  }).sort((a, b) => b.plays - a.plays || a.key.localeCompare(b.key));
  // each wake-up served from the bank skipped a Gemini turn: the start-up read (~6,500 tokens)
  return { clips, wakeups: p._wakeups || 0, since: p._since || null, tokens_saved: (p._wakeups || 0) * 6500, version: m.version };
}
