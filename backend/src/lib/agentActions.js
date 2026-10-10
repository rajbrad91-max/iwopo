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
const leadOf = (id, v) => prisma.leads.findFirst({ where: { id: Number(id), vendor_id: v }, select: { id: true, name: true, email: true, event_date: true, event_type: true, location: true, timing_from: true, timing_to: true, hours: true, guests: true, package_snapshot: true, notes: true, custom_data: true, form_snapshot: true } });

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
export async function runActionTool(name, input, vendorId, auth) {
  const v = Number(vendorId);
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
