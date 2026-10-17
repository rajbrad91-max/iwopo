/**
 * 🧭 Project stages, outside messages and the email log (Raj, 2026-10-17: "the PPM board's stages must live
 * in iwopo" — iwopo is the single source of truth for Gale on the Ubuntu PC, the PPM board, Tornado on the
 * phone and the panel).
 *
 * Owner-only by construction: it is reached only through /api/agent (the AI Agent plan feature, 402 for
 * any vendor without it) and the email log writes nothing for such vendors — the standard iwopo product
 * is untouched. Every read and write is filtered by the vendor id from the login, never from the body.
 *
 *   project_stages    one row per booking: data backed up (when, by whom), sent to the editor,
 *                     editing done — photos and videos separately
 *   outside_messages  what he sent outside iwopo (WhatsApp, Instagram…), recorded by him
 *   email_log         every email iwopo sends a client, like the texts in Calls & Messages
 */
import prisma from '../config/prisma.js';
import { getFeatures } from './entitlements.js';

const DATE_FIELDS = ['backed_up_at', 'sent_to_editor_at', 'editing_photos_done_at', 'editing_videos_done_at'];
export const CHANNELS = ['whatsapp', 'instagram', 'facebook', 'phone', 'in_person', 'other'];
const TZ = 'America/Vancouver';

/** The lead, only if it is this vendor's. */
async function leadOf(vendorId, leadId) {
  return prisma.leads.findFirst({ where: { id: Number(leadId), vendor_id: Number(vendorId) }, select: { id: true, name: true, email: true, phone: true, status: true, event_type: true, event_date: true } });   // 🔒 tenancy
}

/** A date from the caller: "2026-10-17", an ISO time, "now", or null to clear. */
function asDate(v) {
  if (v === null || v === '') return null;
  if (v === 'now') return new Date();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) throw new Error(`"${v}" is not a date`);
  return d;
}

const shape = (lead, st) => ({
  lead_id: lead.id,
  client: lead.name,
  event_type: lead.event_type || null,
  shoot_date: lead.event_date ? lead.event_date.toISOString().slice(0, 10) : null,
  status: lead.status,
  backed_up_at: st?.backed_up_at || null,
  backed_up_by: st?.backed_up_by || null,
  sent_to_editor_at: st?.sent_to_editor_at || null,
  editing_photos_done_at: st?.editing_photos_done_at || null,
  editing_videos_done_at: st?.editing_videos_done_at || null,
  updated_at: st?.updated_at || null,
});

/** Every booking with its stages (newest shoot first). */
export async function listStages(vendorId) {
  const v = Number(vendorId);
  const leads = await prisma.leads.findMany({ where: { vendor_id: v, status: 'booked', archived_at: null }, orderBy: { event_date: 'desc' }, select: { id: true, name: true, email: true, phone: true, status: true, event_type: true, event_date: true } });   // 🔒
  const st = await prisma.project_stages.findMany({ where: { vendor_id: v, lead_id: { in: leads.map(l => l.id) } } });   // 🔒
  const by = new Map(st.map(s => [s.lead_id, s]));
  return leads.map(l => shape(l, by.get(l.id)));
}

/** One booking: its stages, the messages sent outside iwopo, and the emails iwopo sent. */
export async function stagesFor(vendorId, leadId) {
  const v = Number(vendorId);
  const lead = await leadOf(v, leadId);
  if (!lead) return null;
  const [st, outside, emails] = await Promise.all([
    prisma.project_stages.findFirst({ where: { vendor_id: v, lead_id: lead.id } }),
    prisma.outside_messages.findMany({ where: { vendor_id: v, lead_id: lead.id }, orderBy: { sent_at: 'desc' }, take: 50 }),
    prisma.email_log.findMany({ where: { vendor_id: v, OR: [{ lead_id: lead.id }, ...(lead.email ? [{ to_email: { equals: lead.email, mode: 'insensitive' } }] : [])] }, orderBy: { sent_at: 'desc' }, take: 50 }),
  ]);
  return {
    ...shape(lead, st),
    outside_messages: outside.map(m => ({ id: m.id, channel: m.channel, direction: m.direction, text: m.body, sent_at: m.sent_at, recorded_by: m.recorded_by })),
    emails: emails.map(e => ({ id: e.id, to: e.to_email, subject: e.subject, kind: e.kind, ok: e.ok, error: e.error || null, sent_at: e.sent_at })),
  };
}

/** Set any of the stages (and the event type, which lives on the booking itself). */
export async function setStages(vendorId, leadId, input = {}) {
  const v = Number(vendorId);
  const lead = await leadOf(v, leadId);
  if (!lead) return null;
  const data = {};
  for (const k of DATE_FIELDS) if (input[k] !== undefined) data[k] = asDate(input[k]);
  if (input.backed_up_by !== undefined) data.backed_up_by = String(input.backed_up_by || '').trim().slice(0, 80);
  if (input.event_type !== undefined) await prisma.leads.updateMany({ where: { id: lead.id, vendor_id: v }, data: { event_type: String(input.event_type || '').trim().slice(0, 80) || null } });   // 🔒
  if (Object.keys(data).length) {
    await prisma.project_stages.upsert({
      where: { lead_id: lead.id },
      create: { vendor_id: v, lead_id: lead.id, ...data },
      update: { ...data, updated_at: new Date() },
    });
  }
  return stagesFor(v, lead.id);
}

/** A message he sent (or got) outside iwopo — WhatsApp, Instagram… — recorded by him. */
export async function addOutsideMessage(vendorId, leadId, input = {}) {
  const v = Number(vendorId);
  const lead = await leadOf(v, leadId);
  if (!lead) return null;
  const channel = CHANNELS.includes(String(input.channel)) ? String(input.channel) : 'other';
  const text = String(input.text || '').trim();
  if (!text) throw new Error('What was the message?');
  const m = await prisma.outside_messages.create({ data: {
    vendor_id: v, lead_id: lead.id, channel,
    direction: input.direction === 'in' ? 'in' : 'out',
    body: text.slice(0, 4000),
    sent_at: input.sent_at ? asDate(input.sent_at) : new Date(),
    recorded_by: String(input.recorded_by || '').trim().slice(0, 80),
  } });
  return { id: m.id, channel: m.channel, direction: m.direction, text: m.body, sent_at: m.sent_at, recorded_by: m.recorded_by };
}

/** Remove a wrongly recorded outside message (this vendor's only). */
export async function deleteOutsideMessage(vendorId, id) {
  const r = await prisma.outside_messages.deleteMany({ where: { id: Number(id), vendor_id: Number(vendorId) } });   // 🔒
  return r.count > 0;
}

/* ── 📧 the email log — written only for vendors with the AI Agent (the standard product writes nothing) ── */
const FEATURE_CACHE = new Map();       // vendor → { on, at } — a minute, so sending mail never waits on it
async function agentOn(vendorId) {
  const v = Number(vendorId);
  const hit = FEATURE_CACHE.get(v);
  if (hit && Date.now() - hit.at < 60_000) return hit.on;
  let on;
  try { const f = await getFeatures(v); on = f instanceof Set ? f.has('agent') : Array.isArray(f) ? f.includes('agent') : !!f?.agent; } catch { on = false; }   // getFeatures gives a Set
  FEATURE_CACHE.set(v, { on, at: Date.now() });
  return on;
}

/** Called after iwopo sends an email to a client. Never throws — logging must not break sending. */
export async function logEmail(vendorId, { to, subject, kind = '', ok = true, error = '', leadId = null }) {
  try {
    const v = Number(vendorId);
    if (!v || !to || !(await agentOn(v))) return;
    const first = String(to).split(',')[0].trim().toLowerCase();
    let lead = leadId ? Number(leadId) : null;
    if (!lead) lead = (await prisma.leads.findFirst({ where: { vendor_id: v, email: { equals: first, mode: 'insensitive' } }, orderBy: { id: 'desc' }, select: { id: true } }))?.id ?? null;   // 🔒
    await prisma.email_log.create({ data: { vendor_id: v, lead_id: lead, to_email: String(to).slice(0, 200), subject: String(subject || '').slice(0, 300), kind: String(kind).slice(0, 40), ok: !!ok, error: String(error || '').slice(0, 500) } });
  } catch (e) { console.error('[email_log]', e.message); }
}

/** For Tornado: a booking's stages by client name or lead id, in plain words. */
export async function stagesSummary(vendorId, { lead_id, client } = {}) {
  const v = Number(vendorId);
  let id = lead_id ? Number(lead_id) : null;
  if (!id && client) {
    const hits = await prisma.leads.findMany({ where: { vendor_id: v, archived_at: null, name: { contains: String(client).slice(0, 80), mode: 'insensitive' } }, orderBy: { event_date: 'desc' }, take: 5, select: { id: true, name: true, status: true } });   // 🔒
    if (hits.length > 1) return { which_one: hits.map(h => `#${h.id} ${h.name} (${h.status})`) };
    id = hits[0]?.id;
  }
  if (!id) return { error: 'No booking by that name' };
  const s = await stagesFor(v, id);
  if (!s) return { error: 'No booking by that name' };
  const day = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }) : 'not yet');
  return {
    client: s.client, event: s.event_type, shoot: s.shoot_date,
    backed_up: s.backed_up_at ? `${day(s.backed_up_at)}${s.backed_up_by ? ` by ${s.backed_up_by}` : ''}` : 'not yet',
    sent_to_editor: day(s.sent_to_editor_at),
    photos_edited: day(s.editing_photos_done_at),
    videos_edited: day(s.editing_videos_done_at),
    last_outside_message: s.outside_messages[0] ? `${s.outside_messages[0].channel}, ${day(s.outside_messages[0].sent_at)}: ${s.outside_messages[0].text.slice(0, 120)}` : null,
    last_email: s.emails[0] ? `${day(s.emails[0].sent_at)}: ${s.emails[0].subject}${s.emails[0].ok ? '' : ' (FAILED)'}` : null,
  };
}
