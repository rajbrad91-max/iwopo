/**
 * ✉️ The client emails a vendor sends from a lead or booking with one button (Raj, 2026-11-17): a payment reminder
 * and a review request. Each is the vendor's own email (Settings → Email templates, lib/emailTemplates.js), filled
 * here for this one client — the vendor sees it first, then sends it (routes/email.js /lead/:leadId/send/:kind).
 */
import prisma from '../config/prisma.js';
import { renderEmail } from './emailTemplates.js';
import { clientBaseUrl } from './vendorHosts.js';
import { currencyFor } from './currencies.js';
import { moneySummary } from '../routes/payments.js';

/** the emails sent this way */
export const LEAD_EMAILS = ['payment_reminder', 'review_request'];

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

/** the email ready to send to this lead's client: { to, subject, body, html? } */
export async function leadEmail(lead, kind) {
  if (!LEAD_EMAILS.includes(kind)) throw Object.assign(new Error('No such email'), { status: 404 });
  if (!lead.email) throw refuse('This client has no email address');
  const values = kind === 'payment_reminder' ? await paymentValues(lead) : await reviewValues(lead);
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
