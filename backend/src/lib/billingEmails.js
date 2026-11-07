import prisma from '../config/prisma.js';
import { stripe } from './stripe.js';
import { sendPlatformEmail } from '../routes/email.js';
import { emailShell, emailRows, emailButton, emailText, esc } from './emailLayout.js';

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
    : ends ? `It renews on ${day(ends)}. You can turn auto-renew off any time in Settings → Account.` : '';
  const subject = first ? (paid ? `Your iwopo ${plan} plan is active` : `Your iwopo ${plan} free trial has started`) : `Your iwopo receipt: ${money(paid, inv.currency)}`;
  const headline = first ? (paid ? `Welcome to ${plan}` : `Your ${plan} free trial has started`) : 'Thank you for your payment';
  const lead = first && !paid ? `Nothing has been charged today. ${renews}` : `We received ${money(paid, inv.currency)} for your ${plan} plan. ${renews}`;
  const text = `${headline}\n\n${lead}\n\nInvoice: ${inv.hosted_invoice_url || ''}\nYour panel: ${APP_URL}/panel\n\niwopo · this mailbox is not monitored; reply via your panel's Help.`;
  const html = emailShell({ title: headline, preheader: lead, body:
    emailText(`Hi ${esc(owner?.name || vendor.business_name)}, ${esc(lead)}`)
    + emailRows([['Plan', plan], ['Paid', money(paid, inv.currency)], inv.number && ['Invoice', inv.number], ends && [sub?.cancel_at_period_end ? 'Ends' : 'Renews', day(ends)]])
    + (inv.hosted_invoice_url ? emailButton(inv.hosted_invoice_url, 'View invoice') : '')
    + (inv.invoice_pdf ? emailButton(inv.invoice_pdf, 'Download PDF') : '')
    + emailButton(`${APP_URL}/panel`, 'Open your panel', true) });
  await sendPlatformEmail(to, subject, text, html);
  await stripe('POST', `/invoices/${inv.id}`, { metadata: { iwopo_emailed: '1' } });
}
