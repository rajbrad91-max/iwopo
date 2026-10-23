/**
 * 🎧 Tornado's "Google ear" mode (Raj, 2026-10-15): the phone hears him with Google's own speech engine
 * (the one behind Gboard's mic — on the phone, free, good with his accent) and sends TEXT here. Claude
 * Haiku thinks with Tornado's own rules and tools, and its words are spoken back in Tornado's voice
 * (Charon) by Gemini's speech service, streamed sentence by sentence. Gemini no longer re-hears the whole
 * conversation on every reply — the switch in the app picks this mode or Gemini Live.
 *
 * One turn = one POST; the answer streams back as server-sent events:
 *   text  — Tornado's words as they come       audio — 24 kHz 16-bit PCM (base64), in order
 *   card  — a Yes/No proposal                   end / pause — goodbye / "hold on"
 *   done  — cost of this turn
 */
import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import { getSetting } from './settings.js';
import { liveSetup, voiceToolList } from './geminiLive.js';

const SESSIONS = new Map();                          // session id → { messages, system, tools, at }
const TTL = 30 * 60_000;
const PORT = process.env.PORT || 3001;

async function sessionFor(vendorId, id) {
  for (const [k, s] of SESSIONS) if (Date.now() - s.at > TTL) SESSIONS.delete(k);
  const key = `${vendorId}:${id}`;
  let s = SESSIONS.get(key);
  if (!s) {
    // the same instructions and tools Tornado has on Gemini Live — one source, nothing to drift
    const setup = await liveSetup(vendorId, { preview: true });
    const system = `${setup.systemInstruction.parts[0].text}

EAR MODE: you hear him through the phone's speech-to-text (words may be misheard — read the meaning) and your words are spoken aloud. Plain sentences only — no lists, no markdown, no emojis. For anything outside iwopo (weather, drive times, news, opening hours, facts) use web_search, then answer in one or two short sentences — never read out links or sources.`;
    s = { messages: [], system, tools: await voiceToolList(vendorId), at: Date.now() };
    SESSIONS.set(key, s);
  }
  s.at = Date.now();
  return s;
}

/* ── 🔊 Tornado's voice: Gemini speech, streamed ── */
async function speakGemini(text, push, send, cost) {
  const key = await getSetting('gemini_api_key', '');
  const model = (await getSetting('ear_tts_model', '')) || 'gemini-3.8-flash-lite-tts';
  const voice = (await getSetting('gemini_voice', '')) || 'Charon';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
  });
  if (!r.ok || !r.body) { send('error', { message: `voice (Gemini) ${r.status}` }); return false; }
  const dec = new TextDecoder();
  let buf = '', last = 0;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    for (;;) {
      const m = buf.match(/\r?\n\r?\n/);
      if (!m) break;
      const ev = buf.slice(0, m.index); buf = buf.slice(m.index + m[0].length);
      const line = ev.split(/\r?\n/).find(l => l.startsWith('data: '));
      if (!line) continue;
      const d = JSON.parse(line.slice(6));
      for (const p of d.candidates?.[0]?.content?.parts || []) if (p.inlineData?.data) push(p.inlineData.data);
      if (d.usageMetadata) { cost.tts_in = d.usageMetadata.promptTokenCount || cost.tts_in; last = d.usageMetadata.candidatesTokenCount || 0; }
    }
  }
  cost.tts_out += last; cost.tts_in_total += cost.tts_in || 0;
  return true;
}

/* ── 🔊 Tornado's voice on Deepgram Aura-2 (Raj, 2026-10-16): ~0.2 s to the first sound and no daily cap
   (Gemini's key allowed 100 voice requests a day). Raw 24 kHz 16-bit PCM — exactly what the phone plays.
   Voice: Super Admin setting ear_dg_voice. Gemini stays as the backup voice. ── */
async function speakDeepgram(text, push, send, cost) {
  const key = await getSetting('deepgram_api_key', '');
  if (!key) return false;
  const voice = (await getSetting('ear_dg_voice', '')) || 'aura-2-odysseus-en';
  const r = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}&encoding=linear16&sample_rate=24000&container=none`, {
    method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  if (!r.ok || !r.body) { send('error', { message: `voice (Deepgram) ${r.status}` }); return false; }
  let carry = null;                                   // 16-bit samples never split across two pieces
  for await (const chunk of r.body) {
    let b = Buffer.from(chunk);
    if (carry) { b = Buffer.concat([carry, b]); carry = null; }
    if (b.length % 2) { carry = b.subarray(b.length - 1); b = b.subarray(0, b.length - 1); }
    if (b.length) push(b.toString('base64'));
  }
  cost.dg_chars = (cost.dg_chars || 0) + text.length;
  return true;
}

/* ── 🔊 Tornado's voice on Raj's own PC (Raj, 2026-10-16): Kokoro af_heart on BRAR's Ubuntu, reached over Tailscale.
   Raw 24 kHz 16-bit PCM — what the phone plays. If the PC is off or slow to answer, Charon speaks instead, and the
   PC is not tried again for 20 s so an off PC never adds a delay to every sentence. ── */
/* v40 (Raj, 2026-10-23: "Gale starts stuttering after a few minutes"): the cause was voices switching mid-answer —
   every sentence was sent to the PC at once, a slow one timed out after 2.5 s, and Charon took over for 20 s, then
   Gale came back. Now: the voice is chosen ONCE per answer (cost.voice), at most 2 sentences go to the PC at a time,
   a slow sentence gets 8 s and one retry, and only a real failure moves the rest of THAT answer to Charon.
   The audio is passed on as it arrives instead of after the whole sentence. */
const pcVoice = { downUntil: 0 };
const pcSlots = { busy: 0, queue: [] };
async function pcSlot() { if (pcSlots.busy >= 2) await new Promise((r) => pcSlots.queue.push(r)); pcSlots.busy++; }
function pcFree() { pcSlots.busy--; const next = pcSlots.queue.shift(); if (next) next(); }
async function pcSpeakOnce(url, token, text, push) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`${url}/speak`, {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: (await getSetting('local_voice_name', '')) || 'af_heart' }),
    });
    if (!r.ok || !r.body) throw new Error(`PC voice ${r.status}`);
    let carry = null, bytes = 0;
    for await (const chunk of r.body) {                       // pass the sound on as it arrives
      let b = Buffer.from(chunk);
      if (carry) { b = Buffer.concat([carry, b]); carry = null; }
      if (b.length % 2) { carry = b.subarray(b.length - 1); b = b.subarray(0, b.length - 1); }
      if (b.length) { bytes += b.length; push(b.toString('base64')); }
    }
    if (bytes < 2) throw new Error('PC voice: empty');
    return true;
  } finally { clearTimeout(timer); }
}
async function speakLocal(text, push, send, cost) {
  const v = cost?.voice;
  if (!v?.gale || v.dead) return false;                      // this answer isn't (or no longer) in Gale's voice
  const url = (await getSetting('local_voice_url', '')).replace(/\/+$/, '');
  const token = await getSetting('local_voice_token', '');
  if (!url || !token) return false;
  await pcSlot();
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let sounded = false;
      try { return await pcSpeakOnce(url, token, text, (pcm) => { sounded = true; push(pcm); }); }
      catch (e) {
        if (sounded) return true;                             // part of the sentence played: never repeat it
        if (attempt === 2) {
          v.dead = true;                                       // the rest of THIS answer: Charon
          pcVoice.downUntil = Date.now() + 20_000;             // and the next answers check the PC again first
          send('error', { message: `PC voice unavailable (${e.name === 'AbortError' ? 'no answer' : e.message}) — Charon speaks` });
          return false;
        }
      }
    }
    return false;
  } finally { pcFree(); }
}

/** The PC voice when it's set up and answering, else the main voice (setting ear_tts_engine, default Gemini). */
async function speakAny(text, push, send, cost) {
  /* 🔊 Raj chooses the voice (2026-10-16): Gemini Charon. The voice is never swapped behind his back —
     a backup voice speaks only if he sets ear_tts_backup (deepgram / gemini). */
  const main = ((await getSetting('ear_tts_engine', '')) || 'gemini') === 'deepgram' ? speakDeepgram : speakGemini;
  const backup = { deepgram: speakDeepgram, gemini: speakGemini }[(await getSetting('ear_tts_backup', '')) || ''];
  const order = backup && backup !== main ? [main, backup] : [main];
  order.unshift(speakLocal);
  let sounded = false;
  const p = (pcm) => { sounded = true; push(pcm); };
  for (const f of order) {
    try { if ((await f(text, p, send, cost)) || sounded) return; } catch (e) { send('error', { message: `voice: ${e.message}` }); if (sounded) return; }
  }
}

/* ── 💵 this turn's cost, into the same daily record the cost bar reads ── */
async function record(vendorId, cost) {
  const n = async (k, d) => Number(await getSetting(k, '')) || d;
  const [hIn, hOut, tIn, tOut] = await Promise.all([n('ear_haiku_in_per_m', 0.10), n('ear_haiku_out_per_m', 0.50), n('ear_tts_in_per_m', 0.5), n('ear_tts_out_per_m', 6)]);
  const dgK = await n('ear_dg_tts_per_k', 0.030);
  const [sIn, sOut] = await Promise.all([n('ear_sonnet_in_per_m', 2), n('ear_sonnet_out_per_m', 10)]);
  const sonnetMicro = (cost.s_in || 0) * sIn + (cost.s_cache_read || 0) * sIn * 0.1 + (cost.s_cache_write || 0) * sIn * 1.25 + (cost.s_out || 0) * sOut;
  const micro = Math.round(sonnetMicro + (cost.dg_chars || 0) * dgK * 1000 + (cost.searches || 0) * 10000 + cost.in * hIn + cost.cache_read * hIn * 0.1 + cost.cache_write * hIn * 1.25 + cost.out * hOut + cost.tts_in_total * tIn + cost.tts_out * tOut);
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
  await prisma.agent_voice_usage.upsert({
    where: { vendor_id_day: { vendor_id: Number(vendorId), day } },
    create: { vendor_id: Number(vendorId), day, in_text: BigInt(cost.in + cost.cache_read + cost.cache_write + (cost.s_in || 0) + (cost.s_cache_read || 0) + (cost.s_cache_write || 0)), in_audio: 0n, out_text: BigInt(cost.out + (cost.s_out || 0)), out_audio: BigInt(cost.tts_out), cost_micro: BigInt(micro) },
    update: { in_text: { increment: BigInt(cost.in + cost.cache_read + cost.cache_write + (cost.s_in || 0) + (cost.s_cache_read || 0) + (cost.s_cache_write || 0)) }, out_text: { increment: BigInt(cost.out + (cost.s_out || 0)) }, out_audio: { increment: BigInt(cost.tts_out) }, cost_micro: { increment: BigInt(micro) }, updated_at: new Date() },
  }).catch(() => {});
  return micro / 1e6;
}

/** One turn: his words in → Tornado thinks (tools included) → words and voice stream out. */
const FILLERS = ['One sec.', 'Let me check.', 'Checking.', 'Give me a sec.'];

/* 🧠 THE BRAIN (Raj, 2026-10-16): Haiku for everyday talk; Sonnet as the failover — when he repeats, clarifies or
   corrects, when the request is critical (sending, money, deleting…), when Haiku hits a snag mid-turn, or "think
   harder". Sonnet stays for his next 2 turns too, then Haiku again. Models: settings ear_model / ear_model_smart. */
const FIX = /\b(no+|nope|wrong|incorrect|mistake|not (that|what|right|correct)|i (said|meant|asked)|that'?s not|you didn'?t|again|repeat|what do you mean|clarify|listen to me|confus\w*)\b/i;
const CRITICAL = /\b(send|text|email|reply|delete|remove|erase|cancel|pay|payment|invoice|refund|contract|move|book|schedule|archive|password)\b/i;
const HARDER = /\b(think harder|think properly|use (your )?(big|smart) brain|be smart(er)?)\b/i;
function sameAsLast(prev, now) {
  const a = new Set(String(prev).toLowerCase().match(/[a-z0-9']+/g) || []);
  const b = String(now).toLowerCase().match(/[a-z0-9']+/g) || [];
  return b.length >= 3 && a.size >= 3 && b.filter(w => a.has(w)).length / b.length >= 0.6;
}
function pickBrain(s, text) {
  // a question ("what did Yuffie text me?", "any emails from…?") is a lookup, never a critical action
  const question = /^\s*(what|when|who|whom|whose|where|which|why|how|did|do|does|is|are|was|were|can|could|any|show|tell|read|find|check|list)\b/i.test(text) || /\?\s*$/.test(text);
  let why = HARDER.test(text) ? 'asked to think harder'
    : FIX.test(text) ? 'correction or repeat'
    : sameAsLast(s.lastUser || '', text) ? 'asked again'
    : (!question && CRITICAL.test(text)) ? 'critical request' : '';
  // small talk ("thanks", "okay") never needs the smart brain — and doesn't use up its follow-ups
  const smallTalk = !why && /^(ok(ay)?|thanks?|thank you|cool|great|nice|alright|all right|perfect|got it|bye|good)\b/i.test(text.trim()) && text.trim().split(/\s+/).length <= 4;
  if (why) s.sonnetLeft = 1;
  else if (!smallTalk && s.sonnetLeft > 0) { s.sonnetLeft--; why = 'following up'; }
  s.lastUser = text;
  return why;
}

/* 🌱 THE LEARNING LOOP: after Sonnet sorts out a confusion it saves ONE short lesson, so Haiku gets it right next
   time. Kept to the newest 40 (kind "learned"), never anything about money. */
const LEARN_TOOL = {
  name: 'learn',
  description: 'Only after you sorted out a confusion or correction: save ONE short lesson so the quick brain gets it right next time — what the owner means by a word, a name\'s right spelling, how he wants something done (e.g. "my email" means his business email). One per turn at most. Never anything about money or payments.',
  input_schema: { type: 'object', properties: { lesson: { type: 'string', description: 'one short sentence' } }, required: ['lesson'] },
};
async function saveLearned(vendorId, lesson) {
  const text = String(lesson || '').trim().slice(0, 300);
  if (text.length < 8) return { error: 'Too short' };
  if (/\$|\b(paid|owes?|owed|invoice|payment|deposit|balance|price|fee)\b/i.test(text)) return { error: 'Never money — not saved' };
  await prisma.agent_memory.create({ data: { vendor_id: Number(vendorId), kind: 'learned', text } });
  const old = await prisma.agent_memory.findMany({ where: { vendor_id: Number(vendorId), kind: 'learned' }, orderBy: { created_at: 'desc' }, skip: 40, select: { id: true } });
  if (old.length) await prisma.agent_memory.deleteMany({ where: { id: { in: old.map(o => o.id) } } });
  return { ok: true };
}

/* 🎙️ Is the owner's PC voice (Gale) up right now? Checked at most every 30 s, answered in under a second. */
const galeState = { up: false, at: 0 };
export async function galeUp() {
  if (Date.now() - galeState.at < 30_000) return galeState.up;
  const url = (await getSetting('local_voice_url', '')).replace(/\/+$/, '');
  let up = false;
  if (url && (await getSetting('local_voice_token', ''))) {
    try { up = (await fetch(`${url}/health`, { signal: AbortSignal.timeout(800) })).ok; } catch { up = false; }
  }
  Object.assign(galeState, { up, at: Date.now() });
  return up;
}

/** The recorded "Hey Raj, it's Gale here…" — made once by the PC voice, kept on the server, saved on the phone. */
export const GALE_GREETING = "Hey Raj, it's Gale here. How can I help you?";
export async function galeGreetingPcm() {
  const url = (await getSetting('local_voice_url', '')).replace(/\/+$/, '');
  const token = await getSetting('local_voice_token', '');
  const voice = (await getSetting('local_voice_name', '')) || 'af_heart';
  if (!url || !token) return null;
  const r = await fetch(`${url}/speak`, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: GALE_GREETING, voice }) });
  if (!r.ok) return null;
  const pcm = Buffer.from(await r.arrayBuffer());
  return { pcm: pcm.subarray(0, pcm.length - (pcm.length % 2)), version: crypto.createHash('sha1').update(`${voice}|${GALE_GREETING}`).digest('hex').slice(0, 10) };
}

export async function earTurn({ vendorId, auth, sessionId, text, send }) {
  const key = await getSetting('agent_api_key', '');
  if (!key) { send('error', { message: 'No AI key' }); return; }
  const HAIKU = (await getSetting('ear_model', '')) || 'claude-haiku-5-5';
  const SONNET = (await getSetting('ear_model_smart', '')) || 'claude-sonnet-5-5';
  const s = await sessionFor(vendorId, String(sessionId || crypto.randomUUID()));
  s.messages.push({ role: 'user', content: String(text).slice(0, 2000) });
  let why = pickBrain(s, String(text));
  let model = why ? SONNET : HAIKU;
  if (why) send('brain', { model: 'sonnet', why });
  const gale = Date.now() >= pcVoice.downUntil && await galeUp();
  const cost = { in: 0, out: 0, cache_read: 0, cache_write: 0, tts_in: 0, tts_in_total: 0, tts_out: 0, tts_out_last: 0, s_in: 0, s_out: 0, s_cache_read: 0, s_cache_write: 0 };
  cost.voice = { gale, dead: false };                         // 🔊 one voice for the whole answer (v40)
  let spoke = false, filled = false;      // filled: "One sec." already said this turn                                 // ✂️ nothing said yet this turn → speak at the first comma
  let voice = Promise.resolve();                     // sentences are spoken in order, while Haiku keeps writing
  const tm = { t0: Date.now(), word: 0, sound: 0 };   // ⏱️ timing, sent back with 'done' for the phone log
  const say = (sentence) => {
    const t = sentence.trim();
    if (!t) return;
    const job = { chunks: [], done: false, wake: null };
    speakAny(t, (pcm) => { job.chunks.push(pcm); job.wake?.(); }, send, cost).catch(() => {}).finally(() => { job.done = true; job.wake?.(); });
    voice = voice.then(async () => {
      for (;;) {
        while (job.chunks.length) { if (!tm.sound) tm.sound = Date.now() - tm.t0; send('audio', { pcm: job.chunks.shift() }); }
        if (job.done) return;
        await new Promise((res) => { job.wake = res; });
        job.wake = null;
      }
    }).catch(() => {});
  };

  for (let round = 0; round < 6; round++) {
    // 🗂️ the rules and tools are cached by Anthropic — re-read at a tenth of the price
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 600, stream: true,
        system: [
          { type: 'text', text: s.system, cache_control: { type: 'ephemeral' } },
          // 🎙️ the name goes with the voice: Gale when the owner's PC speaks, Tornado otherwise
          { type: 'text', text: gale ? 'Right now your name is Gale (the voice on the owner\'s PC). You are Gale — never call yourself Tornado and never say the word "Tornado".' : 'Your name is Tornado.' },
        ],
        tools: [
          ...s.tools.map((t, i) => (i === s.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)),
          // 🌐 Claude's own web search (Raj, 2026-10-16): weather, news, drive times, anything outside iwopo — US$0.01 a search
          { type: 'web_search_20250305', name: 'web_search', max_uses: 2, user_location: { type: 'approximate', city: 'Vancouver', region: 'British Columbia', country: 'CA', timezone: 'America/Vancouver' } },
          ...(model === SONNET ? [LEARN_TOOL] : []),
        ],
        messages: s.messages,
      }),
    });
    if (!r.ok || !r.body) { send('error', { message: `thinking ${r.status}: ${(await r.text()).slice(0, 160)}` }); return; }
    const dec = new TextDecoder();
    let buf = '', pending = '', words = '';
    const blocks = [];                               // the assistant's content, rebuilt from the stream
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      for (;;) {
        const m = buf.match(/\r?\n\r?\n/);
        if (!m) break;
        const ev = buf.slice(0, m.index); buf = buf.slice(m.index + m[0].length);
        const line = ev.split(/\r?\n/).find(l => l.startsWith('data: '));
        if (!line) continue;
        const d = JSON.parse(line.slice(6));
        const P = model === SONNET ? 's_' : '';          // 💵 each brain's tokens priced at its own rate
        if (d.type === 'message_start') { const u = d.message.usage || {}; cost[P + 'in'] += u.input_tokens || 0; cost[P + 'cache_read'] += u.cache_read_input_tokens || 0; cost[P + 'cache_write'] += u.cache_creation_input_tokens || 0; }
        if (d.type === 'message_delta') { cost[P + 'out'] += d.usage?.output_tokens || 0; cost.searches = (cost.searches || 0) + (d.usage?.server_tool_use?.web_search_requests || 0); }
        // ⚡ a lookup is starting and nothing has been said yet → a short "One sec." straight away (no dead silence)
        if (d.type === 'content_block_start' && !spoke && !filled && ['tool_use', 'server_tool_use'].includes(d.content_block.type)
            && !['end_conversation', 'pause_listening'].includes(d.content_block.name)) {
          filled = true;
          say(FILLERS[Math.floor(Math.random() * FILLERS.length)]);
        }
        if (d.type === 'content_block_start') blocks[d.index] = d.content_block.type === 'tool_use' ? { ...d.content_block, input: '' } : { type: 'text', text: '' };
        if (d.type === 'content_block_delta') {
          const b = blocks[d.index];
          if (d.delta.type === 'text_delta') {
            if (gale) d.delta.text = d.delta.text.replace(/\bTornado\b/g, 'Gale');   // 🎙️ Gale's voice never says "Tornado"
            b.text += d.delta.text; words += d.delta.text; pending += d.delta.text;
            if (!tm.word) tm.word = Date.now() - tm.t0;
            send('text', { delta: d.delta.text });
            // a whole sentence → into Tornado's voice straight away
            const cut = pending.search(spoke ? /[.!?…](\s|$)/ : /[.!?…,;:](\s|$)/);
            if (cut >= 0 && pending.length > 12) { say(pending.slice(0, cut + 1)); pending = pending.slice(cut + 1); spoke = true; }
          }
          if (d.delta.type === 'input_json_delta') b.input += d.delta.partial_json;
        }
      }
    }
    if (pending.trim()) say(pending);
    const content = blocks.filter(Boolean).map(b => (b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: b.input ? JSON.parse(b.input) : {} } : { type: 'text', text: b.text })).filter(b => b.type === 'tool_use' || b.text);
    s.messages.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: words || '…' }] });
    const calls = content.filter(b => b.type === 'tool_use');
    if (!calls.length) break;
    // 🧰 the tools run exactly as on Gemini Live: through the same route, as this vendor
    const results = [];
    let snag = false;
    for (const c of calls) {
      if (c.name === 'learn') { results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(await saveLearned(vendorId, c.input?.lesson)) }); send('learned', { lesson: String(c.input?.lesson || '').slice(0, 300) }); continue; }
      if (c.name === 'end_conversation') { results.push({ type: 'tool_result', tool_use_id: c.id, content: '{"ok":true}' }); send('end', {}); continue; }
      if (c.name === 'pause_listening') { results.push({ type: 'tool_result', tool_use_id: c.id, content: '{"ok":true}' }); send('pause', {}); continue; }
      const t = await fetch(`http://127.0.0.1:${PORT}/api/agent/tool`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: c.name, parameters: c.input }) });
      const d = await t.json().catch(() => ({}));
      if (d.proposal) send('card', { proposal: d.proposal });
      const res = t.ok ? d.result ?? d : { error: d.error || t.status };
      if (res?.error || res?.which_one || res?.needs_yes) snag = true;       // 🧠 a snag → the smart brain takes the rest of this turn
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(res).slice(0, 4000) });
    }
    s.messages.push({ role: 'user', content: results });
    if (snag && model !== SONNET) { model = SONNET; why = 'a lookup hit a snag'; s.sonnetLeft = Math.max(s.sonnetLeft || 0, 1); send('brain', { model: 'sonnet', why }); }
  }
  await voice;                                        // every sentence spoken before the turn ends
  // keep the conversation short — the oldest turns go (the tool pairs stay together)
  while (s.messages.length > 24) { s.messages.shift(); while (s.messages.length && (s.messages[0].role !== 'user' || typeof s.messages[0].content !== 'string')) s.messages.shift(); }
  send('done', { cost_usd: await record(vendorId, cost), first_word_ms: tm.word, first_sound_ms: tm.sound, tokens: { in: cost.in + cost.s_in, cache_read: cost.cache_read + cost.s_cache_read, cache_write: cost.cache_write + cost.s_cache_write, out: cost.out + cost.s_out, searches: cost.searches || 0 }, brain: why ? `sonnet (${why})` : 'haiku' });
}
