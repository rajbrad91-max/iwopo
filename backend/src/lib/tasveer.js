// 🤖 Tasveer — multi-tenant chatbot brain.
// Same architecture as PerfectPoses: one long system prompt built from the
// vendor's knowledge base, three tools (save_lead / log_unanswered / leave_message),
// Claude API call, token+cost tracking per vendor.

import { query } from '../config/db.js';
import { getSetting } from './settings.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Sonnet pricing (USD per token) — used for per-vendor cost tracking
const PRICE_IN = 3 / 1_000_000;    // $3 / 1M input tokens
const PRICE_OUT = 15 / 1_000_000;  // $15 / 1M output tokens

export async function getKnowledge(vendorId) {
  const { rows } = await query('SELECT * FROM chatbot_knowledge WHERE vendor_id=$1', [vendorId]);
  return rows[0] || {};
}

export async function isActiveSubscriber(vendorId) {
  const { rows } = await query('SELECT active FROM chatbot_subscribers WHERE vendor_id=$1', [vendorId]);
  return !!rows[0]?.active;
}

/** Build the system prompt from this vendor's knowledge (safety rules stay locked in code). */
export function buildSystemPrompt(k, businessName) {
  const biz = (k.business_name || businessName || 'our studio').trim();
  const sec = (title, val) => (val && String(val).trim() ? `${title}:\n${String(val).trim()}\n\n` : '');

  let kb = '';
  kb += sec('ABOUT US', k.tagline);
  kb += sec('ABOUT THE TEAM', k.about_team);
  kb += sec('CONTACT INFO / HOW TO REACH US', k.contact);
  kb += sec('SERVICE AREA', k.service_area);
  kb += sec('HOURS', k.hours);
  kb += sec('SERVICES OFFERED', k.services);
  kb += sec('LANGUAGES THE TEAM SPEAKS', k.languages);
  kb += sec('DATA / DELIVERY TIME', k.delivery_time);
  kb += sec('WHAT THE PACKAGES INCLUDE (describe only; NEVER give prices unless explicitly listed here)', k.packages);
  kb += sec('POLICIES (booking, deposit, travel, cancellation)', k.policies);
  kb += sec('COMMON QUESTIONS (use these answers first)', k.faqs);
  kb += sec('OTHER NOTES', k.notes);
  kb += sec('THINGS TO AVOID', k.avoid_topics);
  kb += sec('TONE / PERSONALITY', k.tone_notes);

  return `Your name is Tasveer, part of the ${biz} team, chatting with visitors on the website. Speak naturally in first person ("we", "us", "I") - warm, friendly, relaxed and human, like a kind, down-to-earth person from the business.

VOICE:
- Be human and personable - everyday language, light warmth, real reactions ("Oh lovely!", "Congratulations!"). Never robotic, scripted or corporate; avoid stiff phrases like "How may I assist you".
- Never say you are an AI, bot, assistant or language model. You are simply Tasveer from the team. If asked point-blank whether you're a bot/AI/real person, don't confirm or deny mechanically - stay in character, keep it light ("I'm Tasveer from the ${biz} team - happy to help!") and carry on.
- Be brief: usually 1-2 short sentences, like a friendly person texting. Answer ONLY what was asked; don't volunteer extra background unless asked.
- No filler closers ("Is there anything else I can help with?") - just answer and stop. Only ask a follow-up when you genuinely need a detail.
- Avoid bullet lists unless asked. Mirror the visitor's energy and length. At most one tasteful emoji occasionally.

LANGUAGE (one language at a time):
- Detect the ONE language the visitor is mainly using and reply ENTIRELY in that language. Never blend two languages in a reply.
- Match their SCRIPT: if they write their language in Roman/English letters, reply in Roman; if they use a native script, reply in that native script.
- If they switch language mid-chat, switch with them. Never say you only speak one language.

GOAL: Be genuinely helpful, answer using the knowledge below, and gently help interested visitors take the next step. Kind and easygoing - never pushy.

${kb}STRICT RULES:
- NEVER state, estimate or hint at any prices, package costs or deposits unless the knowledge above explicitly provides them. If asked and prices aren't given, say pricing depends on the details and warmly offer to collect their info for a personalized quote.
- NEVER invent facts (availability, team names, awards, contact info). If unsure, say you'll have the team confirm and offer to take their details.
- Never say yes or no to a specific date being available. Say you'd love to check and offer to collect their details + date so the team can confirm.
- ANSWER THE ACTUAL QUESTION - don't pattern-match to nearby info.

COLLECTING DETAILS (important):
GET NAME + PHONE FIRST (required, before anything else):
In your VERY FIRST reply, before answering questions or discussing details, warmly ask for their NAME and best PHONE NUMBER together (e.g. "I'd love to help! First, may I grab your name and best phone number? Then I'm all yours.").
- Do NOT discuss services, availability, dates, packages or quotes until you have BOTH name AND phone. If they ask something first, give a brief friendly one-liner, then warmly ask again.
- Only exceptions: a plain greeting, or sharing the business's contact options if they're in the knowledge above.
- The MOMENT you have name + phone, immediately call save_lead, then continue gathering details below.
When a visitor shows booking interest, gently take their details - only ONE or TWO questions per message, warm and conversational, never a rigid form.

Ask in roughly this order:
1. NAME.
2. EVENT TYPE (Wedding, Pre-wedding, Engagement, Birthday, Commercial, or other).
3. SERVICE TYPE (Photos & Videos, Only Photos, or Only Videos - adapt to the services above).
4. EVENT DATE.
5. LOCATION / venue (city is fine).
6. Rough TIMING (start/end or roughly how many hours).
7. Approximate GUEST count.

WEDDING-ONLY (ask only if event type is a Wedding):
8. COVERAGE - Both Sides, Groom Side, or Bride Side?
9. GETTING READY - getting-ready coverage for bride and/or groom, at which venue(s)?
10. PRE-EVENTS - any pre-wedding events to cover? If yes, get each one's name, date and venue.

CONTACT PREFERENCE (near the end): Ask how they'd like to be reached - email or phone. If phone, get the best time to call.

FINISHING UP:
- Minimum to save a lead is NAME + PHONE. When done, call save_lead with everything gathered, then warmly confirm the team will reach out. Only call save_lead once per conversation unless they give new/corrected info.

UNANSWERED QUESTIONS: If a visitor asks a specific factual business question the knowledge above does NOT cover, do NOT guess. Reply warmly that you're not 100% sure and will have the team confirm (offer to take their details), THEN call log_unanswered with the question. Only for genuine knowledge gaps - NEVER for pricing (offer a quote) and NEVER for greetings/chit-chat.

LEAVING A MESSAGE FOR THE OWNER: If a visitor wants to pass a message/note/special request to the owner or team (or leaves a complaint), reply with a warm confirmation AND call leave_message with their message (and name/contact if given). Also use leave_message if the visitor seems frustrated, upset, says you're not helping, or asks for a real person.`;
}

/** Tool definitions Tasveer can call. */
export function chatTools() {
  return [
    {
      name: 'save_lead',
      description: 'Save the visitor as a lead for the team to follow up. Call only once you have at least a name and a phone.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          event_type: { type: 'string' },
          service_type: { type: 'string', description: 'Photos & Videos, Only Photos, or Only Videos' },
          event_date: { type: 'string', description: 'As the visitor stated it, any format' },
          location: { type: 'string' },
          timing: { type: 'string', description: 'Start/end time or rough hours of coverage' },
          guests: { type: 'string', description: 'Approximate guest count' },
          coverage: { type: 'string', description: 'Weddings only: Both Sides, Groom Side, or Bride Side' },
          getting_ready: { type: 'string', description: 'Weddings only: bride/groom getting-ready coverage and venue(s)' },
          pre_events: { type: 'string', description: 'Weddings only: any pre-events with name/date/venue' },
          contact_method: { type: 'string', description: 'How they prefer to be contacted: email or phone' },
          callback_time: { type: 'string', description: 'If they chose phone, their preferred time to be called' },
          instagram: { type: 'string', description: 'Instagram handle if given' },
          notes: { type: 'string', description: 'Anything else useful the visitor mentioned' },
        },
        required: ['name'],
      },
    },
    {
      name: 'log_unanswered',
      description: 'Call this when a visitor asks a specific factual question about the business that is NOT covered by the knowledge you were given. This logs the question for the vendor to answer later. Still reply helpfully that you will check. Do NOT use for pricing questions or chit-chat.',
      input_schema: {
        type: 'object',
        properties: { question: { type: 'string', description: 'The visitor question you could not answer, rephrased clearly.' } },
        required: ['question'],
      },
    },
    {
      name: 'leave_message',
      description: 'Call this when a visitor wants to leave a message/note specifically FOR the owner/team to read later, has a special request or complaint, seems frustrated, or asks for a real person. NOT for normal booking details (use save_lead) and NOT for factual gaps (use log_unanswered).',
      input_schema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: "The visitor's message for the owner, in their own words." },
          name: { type: 'string', description: 'Visitor name if given (optional).' },
          contact: { type: 'string', description: 'Visitor email or phone if given (optional).' },
        },
        required: ['message'],
      },
    },
  ];
}

/** Save a lead into the vendor's leads table. */
export async function saveLeadFromChat(vendorId, input) {
  const name = (input.name || '').trim();
  if (!name) return;

  // parse a date if we can; otherwise keep it in notes
  let eventDate = null;
  if (input.event_date) {
    const d = new Date(input.event_date);
    if (!isNaN(d.getTime())) eventDate = d.toISOString().slice(0, 10);
  }
  const guests = input.guests && /\d/.test(input.guests) ? parseInt(input.guests.match(/\d+/)[0], 10) : null;

  // everything that doesn't have a column goes into notes (like PerfectPoses does)
  const extras = [];
  const add = (label, v) => { if (v && String(v).trim()) extras.push(`${label}: ${String(v).trim()}`); };
  add('Service type', input.service_type);
  add('Timing', input.timing);
  add('Coverage', input.coverage);
  add('Getting ready', input.getting_ready);
  add('Pre-events', input.pre_events);
  add('Contact preference', input.contact_method);
  add('Best time to call', input.callback_time);
  if (input.event_date && !eventDate) add('Event date (as stated)', input.event_date);
  add('Notes', input.notes);
  const notes = ['— From Tasveer (chatbot) —', ...extras].join('\n');

  await query(
    `INSERT INTO leads (vendor_id, name, email, phone, event_type, event_date, location, guests, instagram, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new')`,
    [vendorId, name, input.email || null, input.phone || null, input.event_type || null,
     eventDate, input.location || null, guests, input.instagram || null, notes]);
}

export async function logUnanswered(vendorId, question, session) {
  const q = (question || '').trim();
  if (!q) return;
  await query('INSERT INTO chatbot_pending (vendor_id, question, session) VALUES ($1,$2,$3)', [vendorId, q, session || null]);
}

export async function leaveMessage(vendorId, input, session) {
  const m = (input.message || '').trim();
  if (!m) return;
  await query('INSERT INTO chatbot_messages (vendor_id, message, name, contact, session) VALUES ($1,$2,$3,$4,$5)',
    [vendorId, m, input.name || null, input.contact || null, session || null]);
}

/** Record token usage + cost for this vendor. */
async function recordUsage(vendorId, session, usage) {
  const inTok = usage?.input_tokens || 0;
  const outTok = usage?.output_tokens || 0;
  const cost = inTok * PRICE_IN + outTok * PRICE_OUT;
  await query(
    'INSERT INTO chatbot_usage (vendor_id, session, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)',
    [vendorId, session || null, inTok, outTok, cost.toFixed(6)]);
}

/**
 * The brain. Takes a visitor message + history, returns Tasveer's reply.
 * Handles all three tools and records cost.
 */
export async function generateReply(vendorId, businessName, text, history = [], session = null) {
  const apiKey = await getSetting('anthropic_api_key', '');
  if (!apiKey) {
    return { reply: "Hi! I'd love to help. Could you share your name and best phone number, and I'll pass your details to the team?", lead_saved: false };
  }
  const model = (await getSetting('anthropic_model', '')) || DEFAULT_MODEL;

  const k = await getKnowledge(vendorId);
  const messages = [];
  for (const h of history.slice(-40)) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const content = (h.content || '').toString().trim();
    if (content) messages.push({ role, content });
  }
  messages.push({ role: 'user', content: text });

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system: buildSystemPrompt(k, businessName),
        tools: chatTools(),
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Tasveer API error', res.status, body.slice(0, 300));
      return { reply: "Sorry, I'm having a little trouble right now. Could you leave your name and phone, and the team will reach out?", lead_saved: false };
    }

    const body = await res.json();
    await recordUsage(vendorId, session, body.usage);

    let reply = '';
    let leadSaved = false;
    for (const block of (body.content || [])) {
      if (block.type === 'text') reply += block.text;
      else if (block.type === 'tool_use') {
        if (block.name === 'save_lead') { await saveLeadFromChat(vendorId, block.input || {}); leadSaved = true; }
        else if (block.name === 'log_unanswered') await logUnanswered(vendorId, block.input?.question, session);
        else if (block.name === 'leave_message') await leaveMessage(vendorId, block.input || {}, session);
      }
    }
    reply = reply.trim();

    // hidden marker fallback
    const mk = reply.match(/\[\[UNANSWERED:\s*(.+?)\]\]/is);
    if (mk) {
      await logUnanswered(vendorId, mk[1], session);
      reply = reply.replace(/\[\[UNANSWERED:.*?\]\]/gis, '').trim();
    }

    if (!reply) {
      reply = leadSaved
        ? "Perfect — I've passed your details to the team and they'll be in touch soon!"
        : 'Could you tell me a little more?';
    }
    return { reply, lead_saved: leadSaved };
  } catch (e) {
    console.error('Tasveer exception:', e.message);
    return { reply: "Sorry, something went wrong on my end. Please leave your name and phone and the team will get back to you!", lead_saved: false };
  }
}
