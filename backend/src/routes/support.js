/**
 * 🛟 /api/support — a vendor asks iwopo for help (2026-11-03).
 *
 * POST /api/support/message { topic, subject, message, page } — files the message in Super Admin's Messages inbox
 * (support_messages), then emails SUPPORT_EMAIL (sales@iwopo.com) with who is asking (studio, account, plan state,
 * page they were on) and Reply-To set to the vendor, so answering is one click; the vendor gets a short "we got it"
 * copy. Filed first: a message is never lost because an email could not be sent. Signed-in vendors only, 5 messages an hour per account. Who is asking
 * comes from the token, never from the request.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { limit } from '../middleware/rateLimit.js';
import { sendPlatformEmail } from './email.js';
import { billingAccess } from '../lib/billing.js';

const router = express.Router();
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'sales@iwopo.com';
const TOPICS = { question: 'Question', problem: 'Something isn’t working', billing: 'Billing', idea: 'Feature idea' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

router.post('/message', requireAuth, limit({ name: 'support', max: 5, windowMs: 60 * 60 * 1000, perAccount: true }), async (req, res) => {
  try {
    const vendorId = Number(req.user.vendor_id) || null;                       // 🔒 from the token
    const topic = TOPICS[req.body?.topic] ? req.body.topic : 'question';
    const subject = String(req.body?.subject || '').trim().slice(0, 140);
    const message = String(req.body?.message || '').trim().slice(0, 5000);
    const page = String(req.body?.page || '').trim().slice(0, 200);
    if (message.length < 10) return res.status(400).json({ error: 'Please describe what you need in a sentence or two.' });

    const user = await prisma.users.findUnique({ where: { id: Number(req.user.id) }, select: { name: true, email: true } });
    const vendor = vendorId ? await prisma.vendors.findUnique({ where: { id: vendorId }, select: { business_name: true, slug: true } }) : null;
    const access = vendorId ? await billingAccess(vendorId).catch(() => null) : null;
    const who = vendor?.business_name || user?.name || 'A vendor';
    const head = `[iwopo help] ${TOPICS[topic]}${subject ? `: ${subject}` : ''} — ${who}`;
    const facts = [
      ['Studio', vendor ? `${vendor.business_name} (${vendor.slug}, vendor #${vendorId})` : '—'],
      ['From', `${user?.name || '—'} <${user?.email || '—'}>`],
      ['Plan', access ? access.reason : '—'],
      ['Page', page || '—'],
      ['Browser', String(req.headers['user-agent'] || '').slice(0, 160)],
    ];
    const text = `${message}\n\n— — —\n${facts.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReply to this email to answer them.`;
    const html = `<p style="white-space:pre-wrap">${esc(message)}</p><hr><table>${facts.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table><p>Reply to this email to answer them.</p>`;
    await prisma.support_messages.create({
      data: { vendor_id: vendorId, from_email: user?.email || null, subject: `${TOPICS[topic]}${subject ? `: ${subject}` : ''}`.slice(0, 200), body: message },
    });
    try { await sendPlatformEmail(SUPPORT_EMAIL, head, text, html, { replyTo: user?.email || undefined }); }
    catch (e) { console.warn(`🛟 help message from vendor ${vendorId} filed, but not emailed: ${e.message}`); }

    if (user?.email) {                                                         // the vendor's copy (best effort)
      sendPlatformEmail(user.email, 'We got your message — iwopo',
        `Hi ${user.name || who},\n\nThanks — we got your message and will reply to this email address.\n\nYour message:\n${message}\n\n— iwopo`,
        `<p>Hi ${esc(user.name || who)},</p><p>Thanks — we got your message and will reply to this email address.</p><p><b>Your message:</b></p><p style="white-space:pre-wrap">${esc(message)}</p><p>— iwopo</p>`,
      ).catch(() => {});
    }
    res.json({ ok: true, reply_to: user?.email || null });
  } catch (e) {
    res.status(500).json({ error: 'We could not send your message just now — please email sales@iwopo.com.' });
  }
});

export default router;
