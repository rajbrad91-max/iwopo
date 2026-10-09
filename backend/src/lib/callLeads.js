/**
 * 📋 A lead from a phone call — asked for once, made when the words exist.
 *
 * Raj, 2026-10-09: "if I click yes, create lead, it should wait for the
 * transcript to be ready, and as soon as it is, create the lead. It should
 * also understand if a booking was done — not mark it booked, but notify me
 * so I approve it. Approved, it goes to bookings and shows in the calendar."
 *
 * A call carries its own little state (comms_events.lead_state):
 *   waiting   Raj asked; Quo has not written the summary/transcript yet
 *   working   being read right now (claimed, so the webhook and the sync
 *             cannot both create the same lead)
 *   created   a lead exists — new, or the caller's existing lead it was added to
 *   none      the call was not an inquiry (a supplier, a friend…)
 *   no_text   no summary or transcript ever came; Raj is told to do it by hand
 *   no_ai     the AI key is missing or rejected; parked, and made by itself
 *             as soon as a key is saved
 *   failed    the AI could not be reached for two hours; Raj is told
 * and, beside it, booking_state: suggested → approved | dismissed.
 *
 * 🔒 Private to the platform owner like the rest of Calls & messages, and
 * every query is scoped to the vendor.
 */
import prisma from '../config/prisma.js';
import { extractLead } from './callToLead.js';
import { badgesFor, tenDigits } from './commsBadges.js';
import { notify } from '../routes/notifications.js';
import { getSetting } from './settings.js';

const GIVE_UP_MS = 2 * 60 * 60_000;     // Quo writes transcripts within minutes; two hours means it never will

const otherOf = (e) => (e.direction === 'incoming' ? e.from_number : e.to_number);
function pretty(n) {
  const d = tenDigits(n);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (n || 'an unknown number');
}

/** A stored transcript as a plain conversation ("Caller: … / Us: …"). */
export function transcriptText(raw) {
  if (!raw) return '';
  try {
    const t = JSON.parse(raw);
    if (Array.isArray(t?.lines)) return t.lines.map(l => `${l.us ? 'Us' : 'Caller'}: ${l.text}`).join('\n');
  } catch { /* an older plain-text transcript */ }
  return String(raw).trim();
}

/** Raj pressed "Create lead" on this call. Marks it, then tries straight away. */
export async function requestLead(vendorId, eventId) {
  const v = Number(vendorId);
  const ev = await prisma.comms_events.findFirst({
    where: { id: BigInt(eventId), vendor_id: v, kind: 'call' },        // 🔒 tenancy
    select: { id: true, lead_state: true, lead_id: true },
  });
  if (!ev) return { error: 'Call not found' };
  if (ev.lead_state === 'created') return { state: 'created', lead_id: ev.lead_id };
  await prisma.comms_events.update({
    where: { id: ev.id },
    data: { lead_state: 'waiting', lead_asked_at: new Date() },
  });
  await processLeadRequests(v);
  const now = await prisma.comms_events.findUnique({ where: { id: ev.id }, select: { lead_state: true, lead_id: true } });
  return { state: now.lead_state, lead_id: now.lead_id };
}

/** Every call waiting for its lead whose words have now arrived — or never will. */
export async function processLeadRequests(vendorId) {
  const v = Number(vendorId);
  // a key has been saved since — the requests parked for want of one go back in the queue
  if (await getSetting('anthropic_api_key', '')) {
    await prisma.comms_events.updateMany({ where: { vendor_id: v, lead_state: 'no_ai' }, data: { lead_state: 'waiting' } });
  }
  const waiting = await prisma.comms_events.findMany({
    where: { vendor_id: v, kind: 'call', lead_state: 'waiting' },
    select: { id: true },
    take: 20,
  });
  for (const { id } of waiting) {
    // claim it — only one of webhook / sync / button gets to make the lead
    const claimed = await prisma.comms_events.updateMany({ where: { id, lead_state: 'waiting' }, data: { lead_state: 'working' } });
    if (!claimed.count) continue;
    try { await makeLead(v, id); }
    catch (e) {
      console.error('[comms] lead from call:', e.message);
      await prisma.comms_events.update({ where: { id }, data: { lead_state: 'waiting' } });   // try again next sweep
    }
  }
}

async function makeLead(v, id) {
  const ev = await prisma.comms_events.findUnique({ where: { id } });
  const number = otherOf(ev);
  const text = (ev.body || '').trim() || transcriptText(ev.transcript);

  if (!text) {
    if (Date.now() - new Date(ev.occurred_at).getTime() < GIVE_UP_MS) {
      await prisma.comms_events.update({ where: { id }, data: { lead_state: 'waiting' } });   // not yet — keep waiting
      return;
    }
    await prisma.comms_events.update({ where: { id }, data: { lead_state: 'no_text' } });
    await notify(v, `⚠️ No transcript came for the call with ${ev.contact_name || pretty(number)}`,
      'Quo never wrote one, so the lead could not be filled in — add it in Leads by hand.', 'comms', { type: 'comms', id: Number(id) });
    return;
  }

  const out = await extractLead(v, text, { phone: number, contact_name: ev.contact_name });
  if (out.error) {
    /* A missing or rejected AI key will not fix itself: say so ONCE and park
       the request as no_ai — processLeadRequests revives it the moment a key
       is saved. Anything else (network, a busy API) is retried on the next
       sweep, for two hours after the call, then reported. The first version
       retried a missing key silently, forever. */
    if (out.permanent) {
      await prisma.comms_events.update({ where: { id }, data: { lead_state: 'no_ai' } });
      const title = '🤖 Leads from calls need the AI key';
      // one reminder, not one per waiting call
      const told = await prisma.notifications.findFirst({ where: { vendor_id: v, title, created_at: { gt: new Date(Date.now() - 6 * 60 * 60_000) } }, select: { id: true } });
      if (!told) {
        await notify(v, title, `${out.error} Add it in Super Admin → Settings → AI — the waiting lead is then made by itself.`,
          'comms', { type: 'comms', id: Number(id) });
      }
      return;
    }
    if (Date.now() - new Date(ev.occurred_at).getTime() > GIVE_UP_MS) {
      await prisma.comms_events.update({ where: { id }, data: { lead_state: 'failed' } });
      await notify(v, `⚠️ Could not read the call with ${ev.contact_name || pretty(number)}`, `${out.error} — add the lead in Leads.`,
        'comms', { type: 'comms', id: Number(id) });
      return;
    }
    throw new Error(out.error);                                    // retried on the next sweep
  }
  const who = out.name || ev.contact_name || pretty(number);
  const when = new Date(ev.occurred_at).toLocaleDateString();

  if (!out.is_inquiry) {
    await prisma.comms_events.update({ where: { id }, data: { lead_state: 'none' } });
    await notify(v, `🤷 The call with ${who} didn't sound like an inquiry`, 'No lead was made. You can still add one in Leads.', 'comms', { type: 'comms', id: Number(id) });
    return;
  }

  /* Already a lead (or booked)? Then this call belongs to THAT lead — a second
     lead for the same person is the duplicate everybody then has to clean up. */
  const existing = (await badgesFor(v, [number]))[tenDigits(number)];
  let leadId;
  if (existing) {
    const lead = await prisma.leads.findFirst({ where: { id: existing.lead_id, vendor_id: v }, select: { id: true, notes: true } });   // 🔒
    await prisma.leads.update({
      where: { id: lead.id },
      data: { notes: [lead.notes, `📞 Call on ${when}:\n${out.notes || text.slice(0, 1500)}`].filter(Boolean).join('\n\n'), updated_at: new Date() },
    });
    leadId = lead.id;
    await notify(v, `📋 Call added to ${existing.name || who}'s lead`, null, 'comms', { type: 'lead', id: leadId });
  } else {
    const lead = await prisma.leads.create({
      data: {
        vendor_id: v,                                              // 🔒 from the token, never the model
        name: who.slice(0, 200),
        email: out.email || null,
        phone: number || null,
        event_type: out.event_type || null,
        event_date: out.event_date ? new Date(out.event_date) : null,
        location: out.location || null,
        notes: [out.notes, `— from a phone call on ${when}`].filter(Boolean).join('\n\n'),
        heard: 'Phone call',
        status: 'new',
      },
      select: { id: true },
    });
    leadId = lead.id;
    await notify(v, `📋 New lead from your call with ${who}`, out.event_date ? `Event: ${out.event_date}` : null, 'comms', { type: 'lead', id: leadId });
  }

  await prisma.comms_events.update({
    where: { id },
    data: {
      lead_state: 'created', lead_id: leadId,
      // 🟢 a booking is only ever suggested — Raj approves it
      ...(out.booked ? { booking_state: 'suggested', booking_hint: out.booking_evidence || 'The client agreed to go ahead.' } : {}),
    },
  });
  if (out.booked) {
    await notify(v, `🟢 ${who} sounds booked — approve?`, out.booking_evidence || null, 'comms', { type: 'comms', id: Number(id) });
  }
}

/**
 * Raj's answer to "sounds booked — approve?". Approved, the lead becomes a
 * booking: it moves to Bookings and its date shows on the calendar.
 */
export async function answerBooking(vendorId, eventId, approve) {
  const v = Number(vendorId);
  const ev = await prisma.comms_events.findFirst({
    where: { id: BigInt(eventId), vendor_id: v, booking_state: 'suggested' },   // 🔒 tenancy
    select: { id: true, lead_id: true },
  });
  if (!ev?.lead_id) return { error: 'Nothing waiting for approval on this call.' };
  if (approve) {
    const done = await prisma.leads.updateMany({
      where: { id: ev.lead_id, vendor_id: v },                     // 🔒 never another vendor's lead
      data: { status: 'booked', updated_at: new Date() },
    });
    if (!done.count) return { error: 'That lead no longer exists.' };
  }
  await prisma.comms_events.update({ where: { id: ev.id }, data: { booking_state: approve ? 'approved' : 'dismissed' } });
  return { ok: true, lead_id: ev.lead_id, booked: !!approve };
}
