/**
 * 🛟 /api/support — a vendor asks iwopo for help (2026-11-03).
 *
 * POST /api/support/message { topic, subject, message, page, screenshot? } — files the message in Super Admin's Messages inbox
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
import { quiet } from '../lib/quiet.js';
import multer from 'multer';
import crypto from 'crypto';
import * as objects from '../lib/objectStore.js';
import { emailShell, emailText, emailRows, emailButton, esc } from '../lib/emailLayout.js';

/* 📎 one screenshot per message (Raj, 2026-11-07): an image, 5 MB at most, kept in memory only until it is stored privately */
const SHOT_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const shot = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, !!SHOT_TYPES[f.mimetype]) });
const APP_URL = process.env.APP_URL || 'https://iwopo.com';
import { OWNER_INBOX } from '../lib/ownerInbox.js';

const router = express.Router();
const SUPPORT_EMAIL = OWNER_INBOX;
const TOPICS = { question: 'Question', problem: 'Something isn’t working', billing: 'Billing', idea: 'Feature idea' };

router.post('/message', requireAuth, limit({ name: 'support', max: 5, windowMs: 60 * 60 * 1000, perAccount: true }), (req, res, next) => shot.single('screenshot')(req, res, (e) => (e ? res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'That screenshot is over 5 MB — try a smaller one.' : 'That screenshot could not be read.' }) : next())), async (req, res) => {
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
    const row = await prisma.support_messages.create({
      data: { vendor_id: vendorId, from_email: user?.email || null, subject: `${TOPICS[topic]}${subject ? `: ${subject}` : ''}`.slice(0, 200), body: message },
    });
    // 📎 the screenshot, stored privately under the message — only Super Admin can open it
    if (req.file) {
      const key = `support/${row.id}-${crypto.randomBytes(6).toString('hex')}.${SHOT_TYPES[req.file.mimetype]}`;
      try {
        await objects.putObject(objects.PRIVATE, key, req.file.buffer, req.file.mimetype, req.file.size);
        await prisma.support_messages.update({ where: { id: row.id }, data: { attachment_key: key, attachment_type: req.file.mimetype } });
        facts.push(['Screenshot', 'attached — open it in Super Admin → Support']);
      } catch (e) { console.warn(`🛟 screenshot for message ${row.id} not stored: ${e.message}`); facts.push(['Screenshot', 'could not be stored']); }
    }
    const text = `${message}\n\n— — —\n${facts.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReply to this email to answer them.`;
    const html = emailShell({ title: head.replace(/^\[iwopo help\] /, ''), preheader: message.slice(0, 120), body:
      emailText(esc(message).replace(/\n/g, '<br>')) + emailRows(facts)
      + (req.file ? emailButton(`${APP_URL}/panel`, 'Open Super Admin → Support', true) : '') + emailText('Reply to this email to answer them.', { muted: true }) });
    try { await sendPlatformEmail(SUPPORT_EMAIL, head, text, html, { replyTo: user?.email || undefined }); }
    catch (e) { console.warn(`🛟 help message from vendor ${vendorId} filed, but not emailed: ${e.message}`); }

    if (user?.email) {                                                         // the vendor's copy (best effort)
      sendPlatformEmail(user.email, 'We got your message — iwopo',
        `Hi ${user.name || who},\n\nThanks — we got your message and will reply to this email address.\n\nYour message:\n${message}\n\n— iwopo`,
        emailShell({ title: 'We got your message', preheader: 'We will reply to this email address.', body:
          emailText(`Hi ${esc(user.name || who)}, thanks — we got your message and will reply to this email address.`)
          + emailText('<b>Your message:</b>') + emailText(esc(message).replace(/\n/g, '<br>'), { muted: true }) }),
        `/p>`,
      ).catch(quiet('support · sendPlatformEmail'));
    }
    res.json({ ok: true, reply_to: user?.email || null });
  } catch {
    res.status(500).json({ error: 'We could not send your message just now — please email sales@iwopo.com.' });
  }
});

export default router;
