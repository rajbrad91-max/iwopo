/**
 * 🌪️ Tornado on Google Gemini Live (Raj, 2026-10-11).
 *
 * ElevenLabs agents cost ~1,000 credits a minute; Gemini Live is a few cents
 * an hour, with the same real-time, talk-over-it feel. The app talks to Google
 * DIRECTLY (no audio through the VPS), using a single-use, short-lived token
 * this server makes — the real key never leaves the server, and the token is
 * locked to Tornado's setup (model, voice, instructions, tools). Tools are
 * answered by /api/agent/tool with the vendor's own login, exactly as before:
 * tenancy, the yes rule and "never send a contract" all hold.
 */
import { getSetting } from './settings.js';
import { VOICE_TOOLS } from './tornado.js';
import { rulesText } from './agentRules.js';
import { pcAllowed } from './pcAgent.js';
import { zoneOf } from './agentReminders.js';
import { knowledgeText, briefingText, recentConversations } from './agentKnowledge.js';
import prisma from '../config/prisma.js';
import { waitingForYou } from './agentWaiting.js';
import { SHORT, shortParams, PANEL_PAGES, PANEL_TOOL, MERGED_AWAY, MERGED_TOOLS } from './tornadoLean.js';

/** ⏸️ "Hold on, Tornado" → the app stops listening but keeps the conversation; a tap on the bubble resumes (handled in the app). */
const PAUSE_LISTENING = {
  name: 'pause_listening',
  description: 'Pause: stop listening but keep the conversation — call it right after a two-word reply ("Sure, Raj.") when he says hold on, wait, pause or one second.',
  input_schema: { type: 'object', properties: {} },
};

/** 👋 "Thank you, bye" → the app lets the goodbye finish, stops listening and closes (handled in the app, never on the server). */
const END_CONVERSATION = {
  name: 'end_conversation',
  description: 'Close Tornado completely — call it right after a short goodbye when he says bye, thank you bye, that\'s all, good night or stop listening.',
  input_schema: { type: 'object', properties: {} },
};

const API = 'https://generativelanguage.googleapis.com';
export const GEMINI_DEFAULTS = { model: 'gemini-3.1-flash-live-preview', voice: 'Charon' };
/** Google's male voices (prebuilt), for the picker. */
export const GEMINI_MALE_VOICES = ['Charon', 'Orus', 'Fenrir', 'Puck', 'Iapetus', 'Umbriel', 'Algenib', 'Alnilam', 'Achird', 'Sadaltager', 'Enceladus', 'Rasalgethi'];

export async function geminiConfig() {
  return {
    key: await getSetting('gemini_api_key', ''),
    model: (await getSetting('gemini_live_model', '')) || GEMINI_DEFAULTS.model,
    voice: (await getSetting('gemini_voice', '')) || GEMINI_DEFAULTS.voice,
    callMe: (await getSetting('tornado_call_me', '')) || 'Raj',
  };
}

/** JSON Schema → Gemini's Schema (UPPERCASE types, only the keys it knows). */
function toGemini(s) {
  if (!s || typeof s !== 'object') return { type: 'OBJECT', properties: {} };
  const o = { type: String(s.type || 'string').toUpperCase() };
  if (s.description) o.description = s.description;
  if (Array.isArray(s.enum)) o.enum = s.enum.map(String);
  if (s.items) o.items = toGemini(s.items);
  if (s.properties) {
    o.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGemini(v)]));
    if (Array.isArray(s.required) && s.required.length) o.required = s.required;
  }
  if (o.type === 'OBJECT' && !o.properties) o.properties = {};
  return o;
}

/** Everything Tornado starts a conversation with: who it is, the time, what is due, what it knows. */
/** preview: the Rules tab shows the same setup without counting it as a wake-up (no daily event/reminder mentions used up). */
/** The live values Tornado's rules are filled with — the same for the voice session and the
    Wind trial: who, when, what is waiting, recent talks, what you know, a conversation carried on. */
export async function liveVars(vendorId) {
  const c = await geminiConfig();
  const tz = await zoneOf(vendorId);
  const now = new Date();
  const vars = {
    user_name: c.callMe,
    timezone: tz,
    now: now.toLocaleString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    due_soon: 'see WAITING FOR YOU',     // reminders come there now, within their daily limits
    // lessons first (they must be followed every turn), trimmed — facts and memories come from recall
    knowledge: (await knowledgeText(vendorId)).slice(0, 1500),
    // the business picture comes from today_summary / calendar / money when asked — not re-read every turn
    briefing: 'not loaded up front — use today_summary, calendar, money, galleries and the other tools when a question needs it',
    recent: await recentConversations(vendorId, 2),
    waiting: '',            // filled below — a conversation that continues the last one is not a new wake-up
  };
  const last = await prisma.agent_conversations.findFirst({ where: { vendor_id: Number(vendorId) }, orderBy: { created_at: 'desc' }, select: { created_at: true, transcript: true } });   // the greeting count went with the spoken greeting
  const minutesSince = last ? (now - new Date(last.created_at)) / 60000 : Infinity;
  // 📬 only what is new / unseen, events within their daily limits (agentWaiting.js) — counted only on a real wake-up
  vars.waiting = (await waitingForYou(vendorId, { record: false })).slice(0, 1200);   // the app's whats-new counts the wake-up
  let carryOn = '';
  if (minutesSince < 20 && last?.transcript) {
    carryOn = `\n\nYOU WERE JUST TALKING ${Math.max(1, Math.round(minutesSince))} minute(s) ago — this is the SAME conversation, carry on from it. Do not greet again or repeat what was already said. The end of it:\n${last.transcript.slice(-1200)}`;
  }
  return { c, vars, carryOn };
}

export async function liveSetup(vendorId, { preview: _preview = false } = {}) {   // a preview no longer counts anything (the app's whats-new does)
  const pcOk = await pcAllowed(vendorId);                       // 🛡️ the PC tools are the owner's alone
  const { c, vars, carryOn } = await liveVars(vendorId);
  const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] ?? m));
  const instructions = `${fill(await rulesText(vendorId))}${carryOn}

START: the app has already greeted him and read out what is new (the counts) in your voice — stay silent until he speaks, never greet again. If he asks who or what, answer from WAITING FOR YOU. Only if the app sends you a message first (an alarm, a reminder) do you speak first.`;
  return {
    model: `models/${c.model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      // "minimal" thinking made Tornado skip web search and forget its own name (2026-10-12);
      // "low" thinks enough to use its tools and search.
      thinkingConfig: { thinkingLevel: 'low' },
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } },
    },
    systemInstruction: { parts: [{ text: instructions }] },
    tools: [
      // ✂️ one-line descriptions (tornadoLean.js): they are re-sent with every reply
      { functionDeclarations: [...VOICE_TOOLS.filter(t => t.name !== 'web_search' && !PANEL_PAGES.includes(t.name) && !MERGED_AWAY.has(t.name) && (pcOk || !['pc_task', 'delivery_log'].includes(t.name))), PANEL_TOOL, ...MERGED_TOOLS, END_CONVERSATION, PAUSE_LISTENING].map(t => ({ name: t.name, description: SHORT[t.name] || t.description, parameters: toGemini(shortParams(t.input_schema)) })) },
      // 🔎 the world as it is today — new cameras, prices, news (Raj, 2026-10-11: it denied the Canon R6 Mark V exists)
      { googleSearch: {} },
    ],
    // NO contextWindowCompression: with Google Search on, Gemini Live closes the conversation
    // (1007 "invalid argument") the moment a question needs a search — 2026-10-12, twice.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

/**
 * A single-use token for one conversation: it must be used within a minute and
 * lasts 30 minutes, and it only opens the Live API with THIS setup.
 */
export async function liveSession(vendorId) {
  const c = await geminiConfig();
  if (!c.key) throw new Error('Add the Gemini API key first — Super Admin → Settings → AI Agent.');
  const setup = await liveSetup(vendorId);
  const now = Date.now();
  const r = await fetch(`${API}/v1alpha/auth_tokens?key=${encodeURIComponent(c.key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60e3).toISOString(),
      newSessionExpireTime: new Date(now + 60e3).toISOString(),
      bidiGenerateContentSetup: setup,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${d?.error?.message || 'could not start a session'}`);
  return {
    token: d.name,
    wsUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(d.name)}`,
    setup,
    tools: VOICE_TOOLS.map(t => t.name),
  };
}
