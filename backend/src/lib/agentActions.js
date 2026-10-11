/**
 * 🤖 AI Agent — what it may DO, and only after the vendor says yes.
 *
 * Claude never acts directly. A tool here only PROPOSES an action; the panel
 * shows it as a card with ✅ Yes / ❌ No, and only "Yes" runs it — through the
 * very same panel endpoints the vendor's own clicks use, with the vendor's own
 * login, so every rule those endpoints keep (tenancy, the contract-release
 * gate, email settings) still holds.
 *
 * 🚫 Raj, 2026-10-10: the AI Agent NEVER sends a contract. It drafts and checks
 *    contracts in the chat only (from the preview, which saves nothing). It
 *    does not even save a draft: the panel's "make contract" endpoint marks the
 *    contract sent and, with auto-release on, releases it on the spot — the
 *    client could see it. Packages carry the contract, so it may only send
 *    packages for a contract the vendor has ALREADY released themselves.
 */
import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import { day } from './agentTools.js';
import privateDb from '../config/privateDb.js';

const money = (n) => `$${Number(n).toFixed(2)}`;     // "$500.00"
const PENDING = new Map();                 // id → { vendorId, kind, args, title, details, at }
const TTL_MS = 15 * 60 * 1000;
const API = `http://127.0.0.1:${process.env.PORT || 3001}/api`;

/** Run one panel endpoint as the vendor themself. */
async function asVendor(auth, method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.message || `failed (${r.status})`);
  return d;
}
const leadOf = (id, v) => prisma.leads.findFirst({ where: { id: Number(id), vendor_id: v }, select: { id: true, name: true, email: true, phone: true, event_date: true, event_type: true, location: true, timing_from: true, timing_to: true, hours: true, guests: true, package_snapshot: true, notes: true, custom_data: true, form_snapshot: true } });

/** The tools Claude may call — read the contract, or propose an action. */
export const ACTION_TOOLS = [
  {
    name: 'preview_contract',
    description: "The contract this lead WOULD get: the vendor's template filled with the lead's details (exactly what the client would read), plus any contract already made for the lead and whether it is released or signed. Use it to draft, inspect and check a contract — compare names, date, venue, times, package and amounts with the lead, point out mistakes or missing details, and suggest wording. Nothing is sent or saved; the vendor makes and sends contracts themselves in Contracts & Invoices.",
    input_schema: { type: 'object', properties: { lead_id: { type: 'integer' } }, required: ['lead_id'], additionalProperties: false },
  },
  {
    name: 'propose_email',
    description: 'Propose an email to a lead (an answer, instructions, a reminder, a follow-up). Write the subject and the full body, signed off as the vendor. The vendor confirms with Yes/No before it is sent.',
    input_schema: { type: 'object', properties: { lead_id: { type: 'integer' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['lead_id', 'subject', 'body'], additionalProperties: false },
  },
  {
    name: 'propose_create_lead',
    description: 'Propose adding a NEW lead (a client inquiry the vendor took by phone, in person, on Instagram…). Name is needed; fill in whatever else the vendor said. The vendor confirms with Yes/No.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
        event_type: { type: 'string' }, event_date: { type: 'string', description: 'YYYY-MM-DD' },
        location: { type: 'string' }, notes: { type: 'string', description: 'anything else the client asked for' },
        timing_from: { type: 'string', description: 'HH:MM, 24-hour' }, timing_to: { type: 'string', description: 'HH:MM, 24-hour' },
        guests: { type: 'integer', description: 'guest count — 0 if the vendor does not know' },
        services: { type: 'array', items: { type: 'string' }, description: 'e.g. Photography, Videography, Live streaming, Drone, Album' },
        bride_getting_ready: { type: 'boolean', description: 'bride getting-ready coverage' },
        groom_getting_ready: { type: 'boolean', description: 'groom getting-ready coverage' },
      },
      required: ['name'], additionalProperties: false,
    },
  },
  {
    name: 'propose_update_lead',
    description: "Propose changing a lead: its status (e.g. 'booked', 'new', 'contacted', 'lost'), event type, date, venue, start/end times, hours, guests, contact details or client notes. Only include what changes. The vendor confirms with Yes/No.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        changes: {
          type: 'object',
          properties: {
            status: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
            event_type: { type: 'string' }, event_date: { type: 'string', description: 'YYYY-MM-DD' }, location: { type: 'string' },
            timing_from: { type: 'string', description: 'HH:MM, 24-hour' }, timing_to: { type: 'string', description: 'HH:MM, 24-hour' },
            hours: { type: 'integer' }, guests: { type: 'integer' }, notes: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['lead_id', 'changes'], additionalProperties: false,
    },
  },
  {
    name: 'propose_add_note',
    description: "Propose adding a PRIVATE note to a lead (only the vendor sees it) — a call summary, a reminder, what was agreed. The vendor confirms with Yes/No.",
    input_schema: { type: 'object', properties: { lead_id: { type: 'integer' }, note: { type: 'string' } }, required: ['lead_id', 'note'], additionalProperties: false },
  },
  {
    name: 'propose_archive_lead',
    description: 'Propose archiving a lead (it leaves the active list; it can be restored). The vendor confirms with Yes/No.',
    input_schema: { type: 'object', properties: { lead_id: { type: 'integer' } }, required: ['lead_id'], additionalProperties: false },
  },
  {
    name: 'propose_send_text',
    description: "Propose a TEXT MESSAGE (SMS) from the business number — a reply in an existing thread or a brand-new conversation. Give either the client's lead_id (their phone is used) or a phone number (e.g. from calls_and_messages). Write the full text, signed naturally. The owner confirms with Yes/No; nothing is sent before.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer', description: 'the client, if they are a lead' },
        number: { type: 'string', description: 'phone number, if not using lead_id' },
        name: { type: 'string', description: 'who it is, for the card (optional)' },
        text: { type: 'string', description: 'the message' },
      },
      required: ['text'], additionalProperties: false,
    },
  },
  {
    name: 'propose_record_payment',
    description: "Propose recording a payment the owner RECEIVED outside the system (cash, e-transfer, cheque, card in person) on a lead's payments — e.g. \"Yuffie gave me 500 dollars\". Recording a payment also marks the lead booked. The owner confirms with Yes/No.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        amount: { type: 'number', description: 'in dollars' },
        method: { type: 'string', description: 'cash, e-transfer, cheque, card or other' },
        note: { type: 'string', description: 'optional, e.g. "deposit"' },
      },
      required: ['lead_id', 'amount'], additionalProperties: false,
    },
  },
  {
    name: 'propose_send_packages',
    description: "Propose sending the vendor's packages to a lead. Only possible when the vendor has ALREADY released this lead's contract themselves (packages carry the contract). The vendor confirms with Yes/No.",
    input_schema: { type: 'object', properties: { lead_id: { type: 'integer' } }, required: ['lead_id'], additionalProperties: false },
  },
];

function propose(vendorId, kind, args, title, details) {
  for (const [k, p] of PENDING) if (Date.now() - p.at > TTL_MS) PENDING.delete(k);
  const id = crypto.randomBytes(9).toString('base64url');
  PENDING.set(id, { vendorId, kind, args, title, details, at: Date.now() });
  return { id, title, details };
}

/**
 * Run one action tool. Read tools return data; propose tools return
 * { proposal } — which the chat route hands to the panel as a Yes/No card.
 */
const CHANGEABLE = ['status', 'name', 'email', 'phone', 'event_type', 'event_date', 'location', 'timing_from', 'timing_to', 'hours', 'guests', 'notes', 'delivered', 'gr_bride', 'gr_groom'];
const LABEL = { status: 'Status', name: 'Name', email: 'Email', phone: 'Phone', event_type: 'Event', event_date: 'Date', location: 'Venue', timing_from: 'Starts', timing_to: 'Ends', hours: 'Hours', guests: 'Guests', notes: 'Notes', delivered: 'Delivered', gr_bride: 'Bride getting ready', gr_groom: 'Groom getting ready' };
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => CHANGEABLE.includes(k) && v !== undefined && v !== null && String(v).trim() !== '').map(([k, v]) => [k, typeof v === 'string' ? v.trim().slice(0, 1000) : v]));
const yesNo = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === true ? 'Yes' : v === false ? 'No' : v]));
const listOut = (o) => Object.entries(yesNo(o)).map(([k, v]) => `${LABEL[k] || k}: ${v}`).join('\n');

export async function runActionTool(name, input, vendorId, auth) {
  const v = Number(vendorId);
  if (name === 'propose_create_lead') {
    const services = (Array.isArray(input.services) ? input.services : []).map(x => String(x).trim()).filter(Boolean);
    const data = clean({
      name: input.name, email: input.email, phone: input.phone, event_type: input.event_type, event_date: input.event_date, location: input.location,
      timing_from: input.timing_from, timing_to: input.timing_to,
      guests: Number.isFinite(Number(input.guests)) ? Number(input.guests) : 0,          // unknown → 0 (Raj)
      gr_bride: input.bride_getting_ready === true, gr_groom: input.groom_getting_ready === true,
      notes: [services.length ? `Services: ${services.join(', ')}` : '', input.notes || ''].filter(Boolean).join('\n'),
    });
    if (!data.name) return { error: 'A new lead needs a name' };
    return { proposal: propose(v, 'create_lead', data, `Add a new lead: ${data.name}`, listOut(data)) };
  }
  if (name === 'propose_send_text') {
    const text = String(input.text || '').trim().slice(0, 1600);
    if (!text) return { error: 'The text is empty' };
    let number = String(input.number || '').trim(), who = String(input.name || '').trim();
    if (input.lead_id) {
      const l = await leadOf(input.lead_id, v);                           // 🔒 only this vendor's
      if (!l) return { error: 'No lead with that id' };
      if (!l.phone) return { error: `${l.name} has no phone number saved` };
      number = l.phone; who = who || l.name;
    }
    const ten = number.replace(/\D/g, '').slice(-10);
    if (ten.length !== 10) return { error: 'I need a 10-digit phone number' };
    const prior = await privateDb.comms_events.count({ where: { vendor_id: v, OR: [{ from_number: { endsWith: ten } }, { to_number: { endsWith: ten } }] } });
    return { proposal: propose(v, 'text', { number, text, start: !prior }, `Text ${who || number}`, `To: ${number}${prior ? '' : ' — a new conversation'}\n\n${text}`) };
  }
  const lead = await leadOf(input.lead_id, v);
  if (!lead) return { error: 'No lead with that id' };                 // 🔒 only this vendor's
  switch (name) {
    case 'preview_contract': {
      // the same preview the panel shows: { contract: { title, body }, … }
      const preview = await asVendor(auth, 'GET', `/contracts/preview/${lead.id}`).catch(e => ({ error: e.message }));
      const made = await prisma.contracts.findMany({ where: { lead_id: lead.id, vendor_id: v, voided_at: null }, select: { id: true, title: true, status: true, released_at: true, signed_at: true, created_at: true }, orderBy: { id: 'desc' } });
      const text = String(preview?.contract?.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        // what the contract must agree with — the lead as the client gave it
        lead: {
          id: lead.id, name: lead.name, event_type: lead.event_type, event_day: day(lead.event_date),
          venue: lead.location, times: [lead.timing_from, lead.timing_to].filter(Boolean).join(' to ') || null,
          hours: lead.hours, guests: lead.guests, package_chosen: lead.package_snapshot?.name || null,
          package_price: lead.package_snapshot?.price ?? lead.package_snapshot?.base_price ?? null, client_notes: lead.notes,
          form_answers: (Array.isArray(lead.form_snapshot) ? lead.form_snapshot : []).map(f => ({ q: f.label, a: lead.custom_data?.[f.id] })).filter(x => x.a !== undefined && x.a !== null && x.a !== '' && x.a !== false),
        },
        vendor_packages: (await prisma.vendor_packages.findMany({ where: { vendor_id: v }, select: { name: true, base_price: true, included_hours: true } })).map(p => ({ name: p.name, price: p.base_price ? Number(p.base_price) : null, hours: p.included_hours })),
        would_read: preview?.error ? { error: preview.error } : { title: preview?.contract?.title, text: text.slice(0, 12000) },
        contracts_made: made.map(c => ({ id: c.id, title: c.title, status: c.status, released: !!c.released_at, signed: !!c.signed_at, made: day(c.created_at) })),
      };
    }
    case 'propose_email': {
      if (!lead.email) return { error: `${lead.name} has no email address` };
      const subject = String(input.subject || '').trim().slice(0, 200), body = String(input.body || '').trim().slice(0, 8000);
      if (!subject || !body) return { error: 'An email needs a subject and a body' };
      return { proposal: propose(v, 'email', { lead_id: lead.id, subject, body }, `Email ${lead.name} <${lead.email}>`, `Subject: ${subject}\n\n${body}`) };
    }
    case 'propose_update_lead': {
      const changes = clean(input.changes);
      if (!Object.keys(changes).length) return { error: 'Nothing to change' };
      return { proposal: propose(v, 'update_lead', { lead_id: lead.id, changes }, `Update ${lead.name}`, listOut(changes)) };
    }
    case 'propose_add_note': {
      const note = String(input.note || '').trim().slice(0, 2000);
      if (!note) return { error: 'The note is empty' };
      return { proposal: propose(v, 'note', { lead_id: lead.id, note }, `Private note on ${lead.name}`, note) };
    }
    case 'propose_archive_lead':
      return { proposal: propose(v, 'archive', { lead_id: lead.id }, `Archive ${lead.name}`, 'Moves it out of your active leads. You can restore it any time.') };
    case 'propose_record_payment': {
      const amount = Math.round(Number(input.amount) * 100) / 100;
      if (!(amount > 0) || amount > 1e6) return { error: 'A payment needs an amount above zero' };
      const method = ['cash', 'e-transfer', 'cheque', 'card', 'other'].includes(String(input.method || '').toLowerCase()) ? String(input.method).toLowerCase() : 'manual';
      const note = String(input.note || '').trim().slice(0, 200) || null;
      return { proposal: propose(v, 'payment', { lead_id: lead.id, amount, method, note }, `Record ${money(amount)} from ${lead.name}`, `Method: ${method}${note ? `\nNote: ${note}` : ''}\nAdded to their payments (this also marks the lead booked).`) };
    }
    case 'propose_send_packages': {
      if (!lead.email) return { error: `${lead.name} has no email address` };
      const released = await prisma.contracts.findFirst({ where: { lead_id: lead.id, vendor_id: v, voided_at: null, released_at: { not: null } }, select: { id: true } });
      // 🚫 never past an unreleased contract — packages carry it to the client
      if (!released) return { error: `Not possible yet: ${lead.name}'s contract has not been released by you. Packages carry the contract, so release it yourself in Contracts & Invoices first.` };
      return { proposal: propose(v, 'packages', { lead_id: lead.id }, `Send your packages to ${lead.name} <${lead.email}>`, 'Your packages page (with the contract you released) goes to the client by email.') };
    }
    default: return { error: `Unknown tool ${name}` };
  }
}

/** The vendor said Yes: run it — once, only for the vendor who was asked. */
export async function confirmAction(id, vendorId, auth) {
  const p = PENDING.get(String(id));
  if (!p || p.vendorId !== Number(vendorId) || Date.now() - p.at > TTL_MS) return { ok: false, message: 'That request has expired — ask me again.' };
  PENDING.delete(String(id));
  try {
    if (p.kind === 'email') {
      await asVendor(auth, 'POST', `/email/lead/${p.args.lead_id}`, { subject: p.args.subject, body: p.args.body });
      return { ok: true, message: '✉️ Email sent.' };
    }
    if (p.kind === 'create_lead') {
      // the panel's own "new lead" is the public inquiry form — a vendor-made lead is written here, stamped with the vendor
      const d = p.args;
      const lead = await prisma.leads.create({
        data: {
          vendor_id: p.vendorId, status: 'new', name: d.name, email: d.email || null, phone: d.phone || null,
          event_type: d.event_type || null, event_date: d.event_date ? new Date(d.event_date) : null,
          location: d.location || null, notes: d.notes || null, heard: 'Added by the AI Agent',
          timing_from: d.timing_from || null, timing_to: d.timing_to || null, guests: Number(d.guests) || 0,
          gr_bride: d.gr_bride === true, gr_groom: d.gr_groom === true,
        },
        select: { id: true, name: true },
      });
      return { ok: true, message: `🆕 ${lead.name} added to your leads (#${lead.id}).` };
    }
    if (p.kind === 'update_lead') {
      await asVendor(auth, 'PUT', `/leads/${p.args.lead_id}`, p.args.changes);
      return { ok: true, message: '✏️ Lead updated.' };
    }
    if (p.kind === 'note') {
      const l = await prisma.leads.findFirst({ where: { id: p.args.lead_id, vendor_id: p.vendorId }, select: { internal_notes: true } });
      const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const notes = [l?.internal_notes, `[${stamp}] ${p.args.note}`].filter(Boolean).join('\n');
      await asVendor(auth, 'PUT', `/leads/${p.args.lead_id}`, { internal_notes: notes });
      return { ok: true, message: '📝 Note added.' };
    }
    if (p.kind === 'archive') {
      await asVendor(auth, 'POST', '/leads/bulk-archive', { ids: [p.args.lead_id] });
      return { ok: true, message: '🗄️ Lead archived.' };
    }
    if (p.kind === 'text') {
      // the panel's own send — from the business line, logged in Calls & messages
      await asVendor(auth, 'POST', '/comms/message', { number: p.args.number, text: p.args.text, start: p.args.start });
      return { ok: true, message: '💬 Text sent.' };
    }
    if (p.kind === 'payment') {
      // the panel's own "add payment" — tenancy and "mark booked" come with it
      await asVendor(auth, 'POST', `/payments/lead/${p.args.lead_id}`, { amount: p.args.amount, method: p.args.method, note: p.args.note });
      return { ok: true, message: `💵 ${money(p.args.amount)} recorded.` };
    }
    if (p.kind === 'packages') {
      await asVendor(auth, 'POST', `/leads/${p.args.lead_id}/send-packages`, {});
      return { ok: true, message: '📦 Packages sent.' };
    }
    return { ok: false, message: 'Unknown action' };
  } catch (e) { return { ok: false, message: `⚠️ ${e.message}` }; }
}

/** The vendor said No. */
export function cancelAction(id, vendorId) {
  const p = PENDING.get(String(id));
  if (p && p.vendorId === Number(vendorId)) PENDING.delete(String(id));
}
