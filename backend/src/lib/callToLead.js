/**
 * 📞→📋 Turning a call summary into a lead.
 *
 * Raj finishes a call having agreed a date, a place, a guest count and what is
 * being shot. All of that is already written down in the summary Quo produces.
 * Retyping it is both slow and where mistakes come from — a date typed from
 * memory ten minutes later is a date that can be wrong.
 *
 * ⚠️ Nothing is created unless Raj asked for it — he presses "Create lead" on
 * the call (lib/callLeads.js does the rest once the transcript is ready) — and
 * a booking is never set by the model: it is only SUGGESTED, and becomes a
 * booking when Raj approves it. A silently booked wrong Saturday would be far
 * worse than no extraction at all.
 */
import { getSetting } from './settings.js';
import { DEFAULT_MODEL } from './wopoAssistant.js';

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
  "is_inquiry": true or false — was this a client asking about, or arranging, an event we would photograph or film?,
  "booked": true or false — did the client clearly COMMIT on this call (said they want to go ahead, confirmed the date with us, agreed to pay a deposit or sign)?,
  "booking_evidence": "if booked, the words that show it, in one short sentence; else null",
  "confidence": "high | medium | low"
}

Rules:
- Never invent a date. If they said "sometime in August" put that in notes and leave event_date null.
- A year is only included if it was actually said or is unambiguous from context.
- If the call was not about booking an event at all (a supplier, a friend, a wrong number), set is_inquiry false, every other field null and confidence "low".
- booked is false unless the client themselves clearly agreed. Asking for a price, "we'll think about it" or "send me a quote" is NOT booked.
- notes must never be empty when the summary has any detail in it.`;

/**
 * @param {string} text     the call summary, or transcript if there is no summary
 * @param {object} known    what the call itself already tells us
 */
export async function extractLead(vendorId, text, known = {}) {
  const apiKey = await getSetting('anthropic_api_key', '');
  // `permanent`: retrying will not help until somebody fixes the setting
  if (!apiKey) return { error: 'The AI assistant is not configured yet.', permanent: true };
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
        // the model chosen in Super Admin, like every other AI feature — not one pinned here to age
        model: (await getSetting('anthropic_model', '')) || DEFAULT_MODEL,
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: String(text).slice(0, 12000) }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return res.status === 401
        ? { error: 'The AI key was rejected.', permanent: true }
        : { error: `The assistant returned ${res.status}. ${body.slice(0, 120)}` };
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
    is_inquiry: out.is_inquiry !== false,
    // a booking is only ever SUGGESTED — Raj approves it (see lib/callLeads.js)
    booked: out.booked === true,
    booking_evidence: out.booked === true && out.booking_evidence ? String(out.booking_evidence).slice(0, 280) : null,
    confidence: ['high', 'medium', 'low'].includes(out.confidence) ? out.confidence : 'medium',
  };
}
