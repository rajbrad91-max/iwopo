import prisma from '../config/prisma.js';
import { stripe } from './stripe.js';
import { sendPlatformEmail } from '../routes/email.js';

/**
 * ✉️ A vendor's payment emails, from noreply@iwopo.com (Raj, 2026-11-07). One email per paid invoice: the first says
 * the plan is active, later ones are receipts. Each carries Stripe's invoice page and PDF. The invoice is marked once
 * emailed, so Stripe retrying a webhook never sends it twice.
 */
const APP_URL = process.env.APP_URL || 'https://iwopo.com';
/** An invoice's subscription: `subscription` on older Stripe API versions, `parent.subscription_details` on newer ones. */
export const invoiceSubscription = (inv) => inv?.subscription || inv?.parent?.subscription_details?.subscription || null;
const money = (cents, cur) => new Intl.NumberFormat('en', { style: 'currency', currency: String(cur || 'usd').toUpperCase() }).format((cents || 0) / 100);
const day = (secs) => new Date(secs * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function emailInvoice(inv) {
  if (!inv?.id || inv.metadata?.iwopo_emailed) return;
  const vendor = await prisma.vendors.findFirst({ where: { stripe_customer_id: inv.customer }, select: { id: true, business_name: true } });
  if (!vendor) return;
  const owner = await prisma.users.findFirst({ where: { vendor_id: vendor.id, role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true, name: true } });
  const to = owner?.email || inv.customer_email;
  if (!to) return;
  const sub = invoiceSubscription(inv) ? await stripe('GET', `/subscriptions/${invoiceSubscription(inv)}`) : null;
  const ours = await prisma.vendor_subscriptions.findFirst({ where: { vendor_id: vendor.id }, orderBy: { id: 'desc' }, select: { plans: { select: { name: true } } } });
  const plan = ours?.plans?.name || 'iwopo';
  const line = inv.lines?.data?.find(l => l.period) || {};
  const ends = line.period?.end;
  const first = inv.billing_reason === 'subscription_create';
  const paid = inv.amount_paid || 0;
  const renews = sub?.cancel_at_period_end ? `Auto-renew is off: your plan ends on ${ends ? day(ends) : 'the end of this period'}.`
    : ends ? `It renews on ${day(ends)}. You can turn auto-renew off any time in My Services.` : '';
  const subject = first ? (paid ? `Your iwopo ${plan} plan is active` : `Your iwopo ${plan} free trial has started`) : `Your iwopo receipt: ${money(paid, inv.currency)}`;
  const headline = first ? (paid ? `Welcome to ${plan}` : `Your ${plan} free trial has started`) : 'Thank you for your payment';
  const lead = first && !paid ? `Nothing has been charged today. ${renews}` : `We received ${money(paid, inv.currency)} for your ${plan} plan. ${renews}`;
  const text = `${headline}\n\n${lead}\n\nInvoice: ${inv.hosted_invoice_url || ''}\nYour panel: ${APP_URL}/panel\n\niwopo · this mailbox is not monitored; reply via your panel's Help.`;
  const btn = (href, label, solid) => `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:10px;font-weight:600;text-decoration:none;${solid ? 'background:#C44D00;color:#fff' : 'border:1px solid #1A120B;color:#1A120B'}">${label}</a>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#2C241C">
  <p style="margin:0 0 18px;font-size:20px;font-weight:700;color:#1A120B">iwopo</p>
  <h1 style="margin:0 0 10px;font-size:22px;color:#1A120B">${esc(headline)}</h1>
  <p style="margin:0 0 18px;line-height:1.55">Hi ${esc(owner?.name || vendor.business_name)}, ${esc(lead)}</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
    <tr><td style="padding:8px 0;border-bottom:1px solid #EDE4DA;color:#6E6258">Plan</td><td style="padding:8px 0;border-bottom:1px solid #EDE4DA;text-align:right">${esc(plan)}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #EDE4DA;color:#6E6258">Paid</td><td style="padding:8px 0;border-bottom:1px solid #EDE4DA;text-align:right">${money(paid, inv.currency)}</td></tr>
    ${inv.number ? `<tr><td style="padding:8px 0;border-bottom:1px solid #EDE4DA;color:#6E6258">Invoice</td><td style="padding:8px 0;border-bottom:1px solid #EDE4DA;text-align:right">${esc(inv.number)}</td></tr>` : ''}
    ${ends ? `<tr><td style="padding:8px 0;color:#6E6258">${sub?.cancel_at_period_end ? 'Ends' : 'Renews'}</td><td style="padding:8px 0;text-align:right">${day(ends)}</td></tr>` : ''}
  </table>
  ${inv.hosted_invoice_url ? btn(inv.hosted_invoice_url, 'View invoice', false) : ''}${inv.invoice_pdf ? btn(inv.invoice_pdf, 'Download PDF', false) : ''}${btn(`${APP_URL}/panel`, 'Open your panel', true)}
  <p style="margin:22px 0 0;font-size:12px;color:#6E6258">IWOPO, LLC · This mailbox is not monitored. For help, use Help in your panel.</p>
</div>`;
  await sendPlatformEmail(to, subject, text, html);
  await stripe('POST', `/invoices/${inv.id}`, { metadata: { iwopo_emailed: '1' } });
}
