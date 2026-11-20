/**
 * ✉️ The client emails a vendor sends from a lead or booking with one button (Raj, 2026-11-17): a payment reminder,
 * a review request and the invoice (2026-11-18). Each is the vendor's own email (Settings → Email templates, lib/emailTemplates.js), filled
 * here for this one client — the vendor sees it first, then sends it (routes/email.js /lead/:leadId/send/:kind).
 * The invoice goes with its PDF attached (Raj, 2026-11-19), so the client keeps their own copy whatever happens to the link.
 */
import prisma from '../config/prisma.js';
import { renderEmail } from './emailTemplates.js';
import { clientBaseUrl } from './vendorHosts.js';
import { currencyFor } from './currencies.js';
import { moneySummary } from '../routes/payments.js';
import { pageToPdf } from './pdf.js';
import { noteFailure } from './noteFailure.js';

/** the emails sent this way */
export const LEAD_EMAILS = ['payment_reminder', 'review_request', 'invoice'];

/** "$4,500", or "$4,500.50" when there are cents — in the vendor's own currency */
function moneyText(n, currency) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const d = Number.isInteger(v) ? 0 : 2;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  } catch {
    return `${v.toFixed(d)} ${currency}`;
  }
}

/** a refusal the vendor can act on (status 400, their words) */
const refuse = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * 💰 What is due now: the deposit until the first payment, then the remaining balance — the same rule the client's
 * page uses (routes/portal.js), so the email and the page they open always name the same amount.
 */
async function paymentValues(lead) {
  const sum = await moneySummary(lead);
  const deposit = Number(sum.paid) <= 0 && Number(sum.deposit_amount) > 0;
  const due = deposit ? Number(sum.deposit_amount) : Number(sum.balance);
  if (!(due > 0)) throw refuse('Nothing is due on this booking');
  const [vset, ven, base] = await Promise.all([
    prisma.vendor_settings.findUnique({ where: { vendor_id: lead.vendor_id }, select: { currency: true } }),   // 🔒 the lead's owner
    prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { country: true } }),
    clientBaseUrl(lead.vendor_id),
  ]);
  const cur = currencyFor(vset?.currency, ven?.country);
  return {
    payment_due: deposit ? 'deposit' : 'remaining balance',
    amount_due: moneyText(due, cur),
    total_amount: moneyText(sum.final_total, cur),
    paid_amount: moneyText(sum.paid, cur),
    link: `${base}/portal/${lead.client_token}`,
  };
}

/** ⭐ the vendor's review page */
async function reviewValues(lead) {
  const s = await prisma.vendor_settings.findUnique({ where: { vendor_id: lead.vendor_id }, select: { review_url: true } });   // 🔒 the lead's owner
  if (!s?.review_url) throw refuse('Add your review link first: Settings → Setup Email → Review request');
  return { link: s.review_url };
}

/** 🧾 the booking's invoice — its newest one — with what it bills, what is paid and what is left */
async function latestInvoice(lead) {
  return prisma.invoices.findFirst({ where: { lead_id: lead.id, vendor_id: lead.vendor_id }, orderBy: { id: 'desc' } });   // 🔒 the lead's owner
}
async function invoiceValues(lead) {
  const inv = await latestInvoice(lead);
  if (!inv) throw refuse('This booking has no invoice yet');
  const [vset, ven, base] = await Promise.all([
    prisma.vendor_settings.findUnique({ where: { vendor_id: lead.vendor_id }, select: { currency: true } }),
    prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { country: true } }),
    clientBaseUrl(lead.vendor_id),
  ]);
  const cur = currencyFor(vset?.currency, ven?.country);
  return {
    invoice_number: inv.invoice_number,
    total_amount: moneyText(inv.total, cur),
    paid_amount: moneyText(inv.paid, cur),
    amount_due: moneyText(inv.balance, cur),
    link: `${base}/invoice/${inv.token}`,   // the vendor's own address, like the client's page
  };
}

/** 📎 the files that go with an email, by name — what the vendor is shown before sending */
export async function leadEmailFileNames(lead, kind) {
  if (kind !== 'invoice') return [];
  const inv = await latestInvoice(lead);
  return inv ? [await invoiceFileName(lead, inv)] : [];
}

/** 📎 …and the files themselves, made as the email goes: the invoice as its PDF, as it reads today */
export async function leadEmailAttachments(lead, kind) {
  if (kind !== 'invoice') return [];
  const inv = await latestInvoice(lead);
  if (!inv) throw refuse('This booking has no invoice yet');
  return [{ filename: await invoiceFileName(lead, inv), content: await invoicePdf(inv), contentType: 'application/pdf' }];
}

/** 📄 the client's invoice page as a PDF — a second try if the first stumbles; the reason is logged, never lost */
async function invoicePdf(inv) {
  // our own address renders it: the vendor's own domain may not be pointed at us yet
  const url = `${process.env.APP_URL || 'https://iwopo.com'}/invoice/${inv.token}`;
  for (let attempt = 1; ; attempt++) {
    try { return await pageToPdf(url, '.iv-card.is-doc'); }
    catch (e) {
      noteFailure(`make invoice ${inv.invoice_number}'s PDF (try ${attempt})`, e);
      if (attempt === 2) throw Object.assign(new Error('The invoice PDF could not be made — please try again.'), { status: 503 });
    }
  }
}

/** "Invoice INV-1-0003 - Perfect Poses Media.pdf" */
async function invoiceFileName(lead, inv) {
  const ven = await prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { business_name: true } });   // 🔒 the lead's owner
  const name = [`Invoice ${inv.invoice_number}`, ven?.business_name].filter(Boolean).join(' - ');
  return `${name.replace(/[\\/:*?"<>|]+/g, '').trim()}.pdf`;
}

/** what a sent email leaves behind: the invoice remembers when it was emailed */
export async function leadEmailSent(lead, kind) {
  if (kind !== 'invoice') return;
  const inv = await latestInvoice(lead);
  if (inv) await prisma.invoices.update({ where: { id: inv.id }, data: { sent_at: new Date() } });
}

/** the email ready to send to this lead's client: { to, subject, body, html? } */
export async function leadEmail(lead, kind) {
  if (!LEAD_EMAILS.includes(kind)) throw Object.assign(new Error('No such email'), { status: 404 });
  if (!lead.email) throw refuse('This client has no email address');
  const values = kind === 'payment_reminder' ? await paymentValues(lead)
    : kind === 'invoice' ? await invoiceValues(lead)
      : await reviewValues(lead);
  const m = await renderEmail(lead.vendor_id, kind, { client_name: lead.name || '', ...values });
  return { to: lead.email, ...m };
}

/** a well-formed web address for a review page, or null */
export function cleanReviewUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 500) : null;
  } catch { return null; }
}
