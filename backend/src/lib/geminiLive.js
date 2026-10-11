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
import { VOICE_TOOLS, tornadoPrompt } from './tornado.js';
import { dueSoonLine, zoneOf } from './agentReminders.js';
import { knowledgeText, briefingText, recentConversations } from './agentKnowledge.js';

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
export async function liveSetup(vendorId) {
  const c = await geminiConfig();
  const tz = await zoneOf(vendorId);
  const now = new Date();
  const hour = Number(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
  const vars = {
    user_name: c.callMe,
    timezone: tz,
    now: now.toLocaleString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    greeting: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening',
    due_soon: await dueSoonLine(vendorId),
    knowledge: await knowledgeText(vendorId),
    briefing: await briefingText(vendorId),
    recent: await recentConversations(vendorId),
  };
  const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] ?? m));
  const opening = fill("{{greeting}}, {{user_name}}! Tornado here. How's your day going — what can I do for you?");
  const instructions = `${fill(tornadoPrompt())}

START: the moment the conversation opens, say exactly: "${opening}" — then listen.`;
  return {
    model: `models/${c.model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } },
    },
    systemInstruction: { parts: [{ text: instructions }] },
    tools: [{ functionDeclarations: VOICE_TOOLS.map(t => ({ name: t.name, description: t.description, parameters: toGemini(t.input_schema) })) }],
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
