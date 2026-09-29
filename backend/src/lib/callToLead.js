/**
 * 📞→📋 Turning a call summary into a lead.
 *
 * Raj finishes a call having agreed a date, a place, a guest count and what is
 * being shot. All of that is already written down in the summary Quo produces.
 * Retyping it is both slow and where mistakes come from — a date typed from
 * memory ten minutes later is a date that can be wrong.
 *
 * ⚠️ The model fills in what it can and NOTHING is saved without Raj seeing
 * it. An extraction that silently created a booking on the wrong Saturday
 * would be far worse than no extraction at all.
 */
import { getSetting } from './settings.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

/* The lead table has name, email, phone, event_type, event_date, location and
   notes. Everything else Raj mentioned — time, guest count, which services —
   has no column, so it goes in the notes rather than being lost. */
const SYSTEM = `You read a phone call summary between a wedding photographer and a potential client, and pull out the booking details.

Reply with ONLY a JSON object, no prose and no code fence:

{
  "name": "the client's name, or null",
  "email": "their email if mentioned, else null",
  "event_type": "Wedding | Engagement | Reception | Birthday | Corporate | Other, or null",
  "event_date": "YYYY-MM-DD if a specific date was agreed, else null",
  "location": "venue or city, or null",
  "notes": "everything else worth keeping: the time, guest count, which services (photo, video, live streaming), budget, and anything they asked for. Write it as short plain lines, not JSON.",
  "confidence": "high | medium | low"
}

Rules:
- Never invent a date. If they said "sometime in August" put that in notes and leave event_date null.
- A year is only included if it was actually said or is unambiguous from context.
- If the call was not about booking an event at all, return every field null and confidence "low".
- notes must never be empty when the summary has any detail in it.`;

/**
 * @param {string} text     the call summary, or transcript if there is no summary
 * @param {object} known    what the call itself already tells us
 */
export async function extractLead(vendorId, text, known = {}) {
  const apiKey = await getSetting('anthropic_api_key', '');
  if (!apiKey) return { error: 'The AI assistant is not configured yet.' };
  if (!String(text || '').trim()) return { error: 'This call has no summary to read.' };

  let data;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: String(text).slice(0, 12000) }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { error: res.status === 401 ? 'The AI key was rejected.' : `The assistant returned ${res.status}. ${body.slice(0, 120)}` };
    }
    data = await res.json();
  } catch (e) {
    return { error: 'Could not reach the assistant — ' + e.message };
  }

  const raw = (data?.content || []).map(c => c.text || '').join('').trim();
  let out;
  try {
    /* Models sometimes fence the JSON despite being asked not to. Stripping it
       is cheaper than a failed extraction Raj has to retry. */
    out = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  } catch {
    return { error: 'The assistant did not return usable details.' };
  }

  /* 📞 The phone number and the caller's name come from the CALL, not from the
     model. They are already known exactly, and asking a model to re-read what
     we hold precisely is how a digit gets changed. */
  return {
    name: out.name || known.contact_name || null,
    email: out.email || null,
    phone: known.phone || null,
    event_type: out.event_type || null,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(out.event_date || '') ? out.event_date : null,
    location: out.location || null,
    notes: out.notes || '',
    confidence: ['high', 'medium', 'low'].includes(out.confidence) ? out.confidence : 'medium',
  };
}
