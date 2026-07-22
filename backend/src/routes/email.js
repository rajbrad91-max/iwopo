import express from 'express';
import nodemailer from 'nodemailer';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

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

function transporterFor(s) {
  if (s.mode === 'smtp' && s.smtp_host && s.smtp_user) {
    return nodemailer.createTransport({
      host: s.smtp_host, port: s.smtp_port || 587, secure: (s.smtp_port || 587) === 465,
      auth: { user: s.smtp_user, pass: s.smtp_pass },
    });
  }
  if (PLATFORM.host && PLATFORM.user) {
    return nodemailer.createTransport({
      host: PLATFORM.host, port: PLATFORM.port, secure: PLATFORM.port === 465,
      auth: { user: PLATFORM.user, pass: PLATFORM.pass },
    });
  }
  return null;
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
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject + body required' });
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });     // 🔒 tenancy
    if (!lead.email) return res.status(400).json({ error: 'Lead has no email' });

    const s = await getSettings(lead.vendor_id);
    if (s.mode === 'self')
      return res.status(400).json({ error: 'self_mode', message: 'You are in self-receive mode — reply from your own inbox 📥' });

    const t = transporterFor(s);
    if (!t) return res.status(400).json({ error: 'no_transport', message: 'No email server configured yet. Add SMTP creds or platform SMTP pending. ⚙️' });

    const fromEmail = s.mode === 'smtp' ? (s.from_email || s.smtp_user) : PLATFORM.from;
    const fromName = s.from_name || 'iwopo';
    await t.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: lead.email, subject, text: body });
    res.json({ ok: true, sent_to: lead.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📤 shared helper: send an email to a lead using vendor's email settings
export async function sendLeadEmail(req, lead, subject, body) {
  const s = await getSettings(lead.vendor_id);
  if (s.mode === 'self') { const e = new Error('You are in self-receive mode — reply from your own inbox 📥'); e.code = 'self_mode'; throw e; }
  const t = transporterFor(s);
  if (!t) throw new Error('No email server configured yet. Add SMTP creds in Settings → Email ⚙️');
  const fromEmail = s.mode === 'smtp' ? (s.from_email || s.smtp_user) : PLATFORM.from;
  const fromName = s.from_name || 'iwopo';
  await t.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: lead.email, subject, text: body });
}

// 📬 helper used by leads route: notify vendor of new lead
export async function notifyNewLead(lead) {
  try {
    const s = await getSettings(lead.vendor_id);
    const to = s.notify_email || s.from_email || s.smtp_user;
    if (!to) return;
    const t = transporterFor(s);
    if (!t) return;
    const fromEmail = s.mode === 'smtp' ? (s.from_email || s.smtp_user) : PLATFORM.from;
    await t.sendMail({
      from: `"iwopo" <${fromEmail}>`, to,
      subject: `🎉 New inquiry from ${lead.name || 'a client'}`,
      text: `You have a new lead!\n\nName: ${lead.name}\nEmail: ${lead.email}\nEvent: ${lead.event_type || '-'}\nDate: ${lead.event_date || '-'}\n\nLog in to view: https://iwopo.com`,
    });
  } catch { /* never break lead creation over email */ }
}

// 🏢 platform transporter (uses env PLATFORM_SMTP_* — set before launch)
function platformTransporter() {
  if (PLATFORM.host && PLATFORM.user) {
    return nodemailer.createTransport({
      host: PLATFORM.host, port: PLATFORM.port, secure: PLATFORM.port === 465,
      auth: { user: PLATFORM.user, pass: PLATFORM.pass },
    });
  }
  return null;
}

// 📤 send a platform-level email (password resets, system notices).
// Throws { code:'no_platform_smtp' } when env creds aren't set yet.
export async function sendPlatformEmail(to, subject, text, html) {
  const t = platformTransporter();
  if (!t) { const e = new Error('Platform email is not configured yet.'); e.code = 'no_platform_smtp'; throw e; }
  await t.sendMail({ from: `"iwopo" <${PLATFORM.from}>`, to, subject, text, html });
}

export default router;
