/**
 * 📧 The client's copy of the contract they signed, emailed once (Raj, 2026-11-14).
 *
 * The rule, for every vendor: the signed contract goes to the client by itself as soon as the booking is
 * confirmed — the vendor accepting the deposit, or the client paying online — with no one approving it.
 * If the client signs after the booking is already confirmed, it goes at signing.
 *
 * The client gets only the contract they signed: the frozen PDF made at signing, sent the way the vendor's
 * email settings say (their own SMTP, or "<Business> via iwopo"). The signing certificate never goes to the client.
 *
 * The vendor gets their own copy at the same moment — the contract AND the certificate — from iwopo's no-reply
 * address to the email they sign in to iwopo with, whatever their email settings are.
 *
 * Sent once: contracts.client_copy_sent_at is claimed before sending, so a webhook retry, a double click
 * or signing and paying at the same moment cannot send it twice. A failed send gives the claim back.
 * The vendor can send it again on purpose with `force` (the "Email to client" button).
 *
 * Never throws: a mail problem must never undo a payment or a signature. Returns what happened.
 */
import { renderEmail } from './emailTemplates.js';
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { sendLeadEmail, sendPlatformEmail } from '../routes/email.js';
import { noteFailure } from './noteFailure.js';

async function pdfOf(contract) {
  if (contract.pdf_key) {
    try {
      const { stream } = await objects.getStream(objects.PRIVATE, contract.pdf_key);
      const pdf = Buffer.from(await stream.transformToByteArray());
      if (pdf.length) return pdf;
    } catch (e) { noteFailure('read a frozen signed contract', e); }
  }
  // not frozen yet (or the copy could not be read): freeze it now — the same document the download gives
  const { archiveSignedContract } = await import('../routes/contracts.js');
  const a = await archiveSignedContract(contract.id);
  return a?.pdf || null;
}

function fileName(c) {
  const day = c.signed_at ? new Date(c.signed_at).toISOString().slice(0, 10) : 'signed';
  return `contract-${c.leads?.name || c.id}-${day}`.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
}

/** 📜 The vendor's copy: contract + certificate, from iwopo's no-reply, to the account they sign in with. */
async function vendorCopy(c, lead, pdf) {
  try {
    const owner = await prisma.users.findFirst({ where: { vendor_id: lead.vendor_id, role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true } });   // 🔒 this vendor's own account
    if (!owner?.email) return;
    const { certificatePdf } = await import('../routes/contracts.js');
    const cert = await certificatePdf(c.id);
    const base = fileName(c).replace(/^contract-/, '').replace(/\.pdf$/, '');
    await sendPlatformEmail(owner.email,
      `Signed contract — ${lead.name || 'your client'} (with certificate)`,
      [`${lead.name || 'Your client'} is booked.`, '',
       `Attached for your records: the contract they signed and its signing certificate.`,
       `Your client was emailed the contract only — the certificate stays with you.`].join('\n'),
      undefined,
      { attachments: [
        { filename: fileName(c), content: pdf, contentType: 'application/pdf' },
        ...(cert ? [{ filename: `certificate-${base}.pdf`, content: cert, contentType: 'application/pdf' }] : []),
      ] });
  } catch (e) { noteFailure("email the vendor's signed contract copy", e); }
}

/**
 * @param {number} leadId
 * @param {{ force?: boolean, contractId?: number }} opts force = the vendor pressed "Email to client"
 * @returns {Promise<{ sent: boolean, reason?: string, to?: string }>}
 */
export async function sendSignedCopy(leadId, { force = false, contractId = null } = {}) {
  try {
    const lead = await prisma.leads.findUnique({
      where: { id: Number(leadId) },
      select: { id: true, vendor_id: true, name: true, email: true, status: true },
    });
    if (!lead) return { sent: false, reason: 'no_lead' };
    if (!force && lead.status !== 'booked') return { sent: false, reason: 'not_booked' };   // deposit not accepted yet
    if (!lead.email) return { sent: false, reason: 'no_email' };

    const c = await prisma.contracts.findFirst({
      where: { lead_id: lead.id, vendor_id: lead.vendor_id, status: 'signed', voided_at: null,   // 🔒 the lead's own vendor
               ...(contractId ? { id: Number(contractId) } : {}) },
      orderBy: { id: 'desc' },
      include: { leads: { select: { name: true } }, vendors: { select: { business_name: true } } },
    });
    if (!c) return { sent: false, reason: 'not_signed' };
    if (!force && c.client_copy_sent_at) return { sent: false, reason: 'already_sent' };

    // claim it first: two triggers at the same moment send one email
    const before = c.client_copy_sent_at;
    if (!force) {
      const claimed = await prisma.contracts.updateMany({ where: { id: c.id, client_copy_sent_at: null }, data: { client_copy_sent_at: new Date() } });
      if (claimed.count === 0) return { sent: false, reason: 'already_sent' };
    }

    try {
      const pdf = await pdfOf(c);
      if (!pdf) throw new Error('The signed contract PDF could not be made');
      const { subject, body, html } = await renderEmail(lead.vendor_id, 'signed_contract', {   // ✉️ Settings → Email templates
        client_name: lead.name, client_first_name: String(lead.name || '').trim().split(/\s+/)[0] || 'there',
        business_name: c.vendors?.business_name || '', contract_title: c.title || 'Service Agreement',
      });
      await sendLeadEmail(null, lead, subject, body, {
        kind: 'signed_contract', allowSelf: true, html,
        attachments: [{ filename: fileName(c), content: pdf, contentType: 'application/pdf' }],
      });
      if (force) await prisma.contracts.update({ where: { id: c.id }, data: { client_copy_sent_at: new Date() } });
      else await vendorCopy(c, lead, pdf);   // the button resends to the client only
      return { sent: true, to: lead.email };
    } catch (e) {
      if (!force) await prisma.contracts.updateMany({ where: { id: c.id }, data: { client_copy_sent_at: before } }).catch(() => {});   // give the claim back
      try { (await import('./projectStages.js')).logEmail(lead.vendor_id, { to: lead.email, subject: 'Your signed contract', kind: 'signed_contract', ok: false, error: e.message, leadId: lead.id }); } catch {}
      noteFailure('email the signed contract', e);
      return { sent: false, reason: 'send_failed', error: e.message };
    }
  } catch (e) {
    noteFailure('email the signed contract', e);
    return { sent: false, reason: 'error', error: e.message };
  }
}
