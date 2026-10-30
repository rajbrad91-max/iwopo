import express from 'express';
import { logEmail } from '../lib/projectStages.js';
import nodemailer from 'nodemailer';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getAllSettings } from '../lib/settings.js';
import { EHLO_NAME } from '../lib/mailHost.js';   // 📧 connect as a real domain — Google's relay refuses a bare machine name

const router = express.Router();

// 🏢 Platform (iwopo) SMTP — set real creds in env before launch
const PLATFORM = {
  host: process.env.PLATFORM_SMTP_HOST || '',
  port: Number(process.env.PLATFORM_SMTP_PORT || 587),
  user: process.env.PLATFORM_SMTP_USER || '',
  pass: process.env.PLATFORM_SMTP_PASS || '',
  from: process.env.PLATFORM_FROM || 'noreply@iwopo.com',
};

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

async function getSettings(v) {
  const s = await prisma.email_settings.findUnique({ where: { vendor_id: Number(v) } }); // 🔒 tenancy
  return s || { mode: 'platform' };
}

// GET /api/email/settings
router.get('/settings', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const s = await getSettings(v);
    if (s.smtp_pass) s.smtp_pass = '••••••';  // never send real pass back
    res.json({ settings: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/email/settings
router.put('/settings', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const b = req.body;
  try {
    const cur = await getSettings(v);
    const pass = (b.smtp_pass && b.smtp_pass !== '••••••') ? b.smtp_pass : (cur.smtp_pass || null);
    const data = {
      mode: b.mode || 'platform',
      smtp_host: b.smtp_host || null,
      smtp_port: b.smtp_port || 587,
      smtp_user: b.smtp_user || null,
      smtp_pass: pass,
      from_name: b.from_name || null,
      from_email: b.from_email || null,
      notify_email: b.notify_email || null,
    };
    await prisma.email_settings.upsert({
      where: { vendor_id: Number(v) },            // 🔒 tenancy
      update: { ...data, updated_at: new Date() },
      create: { vendor_id: Number(v), ...data },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 📧 The platform's own mail account, from the super-admin settings.
 *
 * These used to be environment variables only, which meant the one person who
 * could set them had to edit a file on the server — so they never were, and
 * nothing in the product could send anything at all. They live beside the R2
 * and AWS credentials now, where they can be typed in.
 *
 * The environment is still read as a fallback, so a deployment that sets them
 * that way keeps working.
 */
export async function platformMail() {
  const s = await getAllSettings().catch(() => ({}));
  const host = s.smtp_host || PLATFORM.host;
  const user = s.smtp_user || PLATFORM.user;
  const pass = s.smtp_pass || PLATFORM.pass;
  const port = Number(s.smtp_port || PLATFORM.port || 587);
  return {
    host, user, pass, port,
    from: s.smtp_from || PLATFORM.from,
    fromName: s.smtp_from_name || 'iwopo',
    ready: !!(host && user && pass),
  };
}

async function transporterFor(s) {
  /* A vendor's own mail account first, so their clients see their address
     rather than ours. */
  if (s.mode === 'smtp' && s.smtp_host && s.smtp_user) {
    return nodemailer.createTransport({ name: EHLO_NAME, 
      host: s.smtp_host, port: s.smtp_port || 587, secure: (s.smtp_port || 587) === 465,
      auth: { user: s.smtp_user, pass: s.smtp_pass },
    });
  }
  const p = await platformMail();
  if (p.ready) {
    return nodemailer.createTransport({ name: EHLO_NAME, 
      host: p.host, port: p.port, secure: p.port === 465,
      auth: { user: p.user, pass: p.pass },
    });
  }
  return null;
}

/**
 * ✉️ Who an email sent on a vendor's behalf is from, and where the client's reply goes (Raj, 2026-10-28 — option B).
 *   • the vendor's own mail account → their own name and address, as before
 *   • no account yet → iwopo's platform address (Super Admin → Email), shown as "<Business> via iwopo", with
 *     replies going to the vendor's own email — so a brand-new vendor's first send just works and the
 *     conversation still lands in their inbox
 */
async function senderFor(vendorId, s) {
  if (s.mode === 'smtp' && s.smtp_host && s.smtp_user) {
    return { from: `"${s.from_name || 'iwopo'}" <${s.from_email || s.smtp_user}>`, replyTo: undefined };
  }
  const [p, v, owner] = await Promise.all([
    platformMail(),
    prisma.vendors.findUnique({ where: { id: vendorId }, select: { business_name: true, email: true } }),
    prisma.users.findFirst({ where: { vendor_id: vendorId, role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true } }),
  ]);
  const name = String(v?.business_name || s.from_name || 'iwopo').replace(/["<>]/g, '');
  return {
    from: `"${name} via iwopo" <${p.from || p.user}>`,
    replyTo: s.from_email || s.notify_email || v?.email || owner?.email || undefined,
  };
}

/* ── 📑 EMAIL TEMPLATES ── */
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const templates = await prisma.email_templates.findMany({
      where: { vendor_id: Number(vid(req)) },     // 🔒 tenancy
      orderBy: { id: 'asc' },
    });
    res.json({ templates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/templates', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const { name, subject, body } = req.body;
    if (!name || !subject || !body) return res.status(400).json({ error: 'Name, subject, body required' });
    const template = await prisma.email_templates.create({
      data: { vendor_id: Number(v), name, subject, body },   // 🔒 tenancy
    });
    res.status(201).json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/templates/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.email_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const { name, subject, body } = req.body;
    // COALESCE($n, col): only overwrite what was supplied
    const data = {};
    if (name !== undefined && name !== null) data.name = name;
    if (subject !== undefined && subject !== null) data.subject = subject;
    if (body !== undefined && body !== null) data.body = body;
    const template = await prisma.email_templates.update({ where: { id }, data });
    res.json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/templates/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.email_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.email_templates.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/email/lead/:leadId → send email to the lead's client
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  const { subject, body, cc, kind } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject + body required' });
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });     // 🔒 tenancy
    if (!lead.email) return res.status(400).json({ error: 'Lead has no email' });

    /**
     * 🔒 Packages can't go out over an unreleased contract.
     *
     * The link in this email opens the portal, and the portal carries the
     * contract as well as the packages — so sending the packages IS sending the
     * contract. It was auto-built from a template and may say something the
     * vendor has never read on this booking.
     *
     * Gated on `kind` rather than on every lead email: a vendor answering a
     * question or chasing a reply should not be stopped by a contract they
     * haven't got to yet. Only the send that exposes the contract is held.
     */
    if (kind === 'packages') {
      const vset = await prisma.vendor_settings.findUnique({
        where: { vendor_id: lead.vendor_id },        // 🔒 the lead's owner, from the row
        select: { auto_release_contract: true },
      });
      if (!vset?.auto_release_contract) {
        const ct = await prisma.contracts.findFirst({
          where: { lead_id: lead.id, voided_at: null },
          orderBy: { id: 'desc' },
          select: { id: true, released_at: true },
        });
        if (ct && !ct.released_at) {
          return res.status(409).json({
            error: 'contract_not_released',
            message: 'Preview and release the contract before sending the packages 👁️',
            contract_id: ct.id,
          });
        }
      }
    }

    // a second address (a partner, a planner) is common on a wedding enquiry
    const ccEmail = String(cc || '').trim();
    if (ccEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ccEmail)) {
      return res.status(400).json({ error: 'That CC address does not look right' });
    }

    const s = await getSettings(lead.vendor_id);
    if (s.mode === 'self')
      return res.status(400).json({ error: 'self_mode', message: 'You are in self-receive mode — reply from your own inbox 📥' });

    const t = await transporterFor(s);
    if (!t) {
    // which side is missing is knowable, so say so rather than making the
    // vendor guess whether it's their fault or ours
    const mine = s.mode === 'smtp';
    return res.status(400).json({
      error: 'no_transport',
      message: mine
        ? '📭 Your SMTP details are incomplete — add your host, username and password under Settings → Email.'
        : '📭 No mail server is set up yet. Add your own under Settings → Email (host, username, password) — sending from your own address also keeps you out of spam folders.',
    });
  }

    const who = await senderFor(lead.vendor_id, s);   // ✉️ their address, or "<Business> via iwopo" with replies to them
    await t.sendMail({
      from: who.from, replyTo: who.replyTo,
      to: lead.email,
      ...(ccEmail ? { cc: ccEmail } : {}),
      subject,
      text: body,
    });
    logEmail(lead.vendor_id, { to: lead.email, subject, kind: 'lead_reply', leadId: lead.id });   // 📧 the email log
    res.json({ ok: true, sent_to: lead.email, cc: ccEmail || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📤 shared helper: send an email to a lead using vendor's email settings
export async function sendLeadEmail(req, lead, subject, body) {
  const s = await getSettings(lead.vendor_id);
  if (s.mode === 'self') { const e = new Error('You are in self-receive mode — reply from your own inbox 📥'); e.code = 'self_mode'; throw e; }
  const t = await transporterFor(s);
  if (!t) throw new Error('Email isn\u2019t available right now — please try again shortly, or add your own email under Settings → Email ⚙️');
  const who = await senderFor(lead.vendor_id, s);   // ✉️ their address, or "<Business> via iwopo" with replies to them
  await t.sendMail({ from: who.from, replyTo: who.replyTo, to: lead.email, subject, text: body });
  logEmail(lead.vendor_id, { to: lead.email, subject, kind: 'lead', leadId: lead.id });   // 📧 the email log
}

// 📬 helper used by leads route: notify vendor of new lead
export async function notifyNewLead(lead) {
  try {
    const s = await getSettings(lead.vendor_id);
    const to = s.notify_email || s.from_email || s.smtp_user;
    if (!to) return;
    const t = await transporterFor(s);
    if (!t) return;
    // the vendor's own address, else iwopo's platform address (Super Admin → Email), not the old server-file one
    const fromEmail = s.mode === 'smtp' ? (s.from_email || s.smtp_user) : ((await platformMail()).from || (await platformMail()).user);
    await t.sendMail({
      from: `"iwopo" <${fromEmail}>`, to,
      subject: `🎉 New inquiry from ${lead.name || 'a client'}`,
      text: `You have a new lead!\n\nName: ${lead.name}\nEmail: ${lead.email}\nEvent: ${lead.event_type || '-'}\nDate: ${lead.event_date || '-'}\n\nLog in to view: ${process.env.APP_URL || 'https://iwopo.com'}`,
    });
  } catch { /* never break lead creation over email */ }
}

// 🏢 platform transporter (uses env PLATFORM_SMTP_* — set before launch)
/* 🏢 iwopo's own mail account, for sign-up codes, password resets and system notices. It reads the Super Admin
   settings (platformMail — the server file only as a fallback), the same place "Send a test" reads: before
   (2026-10-23) this read the server file alone, so saving the account in Super Admin made the test pass while
   sign-up codes still could not be sent. */
async function platformTransporter() {
  const m = await platformMail();
  if (!m.ready) return null;
  return { m, t: nodemailer.createTransport({ name: EHLO_NAME,  host: m.host, port: m.port, secure: m.port === 465, auth: { user: m.user, pass: m.pass } }) };
}

// 📤 send a platform-level email (password resets, system notices).
// Throws { code:'no_platform_smtp' } when env creds aren't set yet.
export async function sendPlatformEmail(to, subject, text, html) {
  const p = await platformTransporter();
  if (!p) { const e = new Error('Platform email is not configured yet.'); e.code = 'no_platform_smtp'; throw e; }
  try {
    await p.t.sendMail({ from: `"${p.m.fromName}" <${p.m.from || p.m.user}>`, to, subject, text, html });
  } catch (err) {
    // the mail server's own words go to the log; the person sees what to do
    console.error('platform email failed:', err.message);
    const e = new Error('We could not send the email just now. Please try again in a minute.'); e.code = 'send_failed'; throw e;
  }
}

/**
 * 📤 Send on a vendor's behalf, using their SMTP when they have set it up and
 * iwopo's own when they have not.
 *
 * transporterFor already encodes that preference; this exposes it so anything
 * else that needs to send goes through the same resolution rather than growing
 * a second, slightly different email system beside it.
 *
 * Returns { ok } or { ok: false, error } — never throws. A file share that
 * succeeded should not report failure because the notification about it
 * bounced, and the caller can say which of the two happened.
 */
export async function sendAsVendor(vendorId, { to, subject, html, text, replyTo }) {
  try {
    const s = await getSettings(vendorId);
    const tx = await transporterFor(s);
    if (!tx) {
      return {
        ok: false,
        error: 'no_transport',
        message: s.smtp_host
          ? 'Your email settings are incomplete — check the host, username and password under Settings → Email.'
          : 'No mail server is configured yet. Add your SMTP details under Settings → Email.',
      };
    }
    const who = await senderFor(vendorId, s);   // ✉️ their address, or "<Business> via iwopo" with replies to them
    await tx.sendMail({
      from: who.from, to, subject, text, html,
      replyTo: replyTo || who.replyTo,   // a client replying reaches the vendor, not a platform mailbox
    });
    logEmail(vendorId, { to, subject, kind: 'vendor' });   // 📧 the email log
    return { ok: true, via: s.mode === 'smtp' && s.smtp_host ? 'vendor' : 'platform' };
  } catch (e) {
    logEmail(vendorId, { to, subject, kind: 'vendor', ok: false, error: e.message });
    return { ok: false, error: 'send_failed', message: e.message };
  }
}

export default router;
