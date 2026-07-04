import express from 'express';
import nodemailer from 'nodemailer';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 🏢 Platform (Vowflo) SMTP — set real creds in env before launch
const PLATFORM = {
  host: process.env.PLATFORM_SMTP_HOST || '',
  port: Number(process.env.PLATFORM_SMTP_PORT || 587),
  user: process.env.PLATFORM_SMTP_USER || '',
  pass: process.env.PLATFORM_SMTP_PASS || '',
  from: process.env.PLATFORM_FROM || 'noreply@vowflo.com',
};

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

async function getSettings(v) {
  const { rows } = await query('SELECT * FROM email_settings WHERE vendor_id=$1', [v]);
  return rows[0] || { mode: 'platform' };
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
    await query(
      `INSERT INTO email_settings (vendor_id, mode, smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, notify_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (vendor_id) DO UPDATE SET
        mode=$2, smtp_host=$3, smtp_port=$4, smtp_user=$5, smtp_pass=$6,
        from_name=$7, from_email=$8, notify_email=$9, updated_at=NOW()`,
      [v, b.mode || 'platform', b.smtp_host || null, b.smtp_port || 587,
       b.smtp_user || null, pass, b.from_name || null, b.from_email || null, b.notify_email || null]);
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

// POST /api/email/lead/:leadId → send email to the lead's client
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject + body required' });
  try {
    const { rows: leads } = await query('SELECT * FROM leads WHERE id=$1', [req.params.leadId]);
    const lead = leads[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });
    if (!lead.email) return res.status(400).json({ error: 'Lead has no email' });

    const s = await getSettings(lead.vendor_id);
    if (s.mode === 'self')
      return res.status(400).json({ error: 'self_mode', message: 'You are in self-receive mode — reply from your own inbox 📥' });

    const t = transporterFor(s);
    if (!t) return res.status(400).json({ error: 'no_transport', message: 'No email server configured yet. Add SMTP creds or platform SMTP pending. ⚙️' });

    const fromEmail = s.mode === 'smtp' ? (s.from_email || s.smtp_user) : PLATFORM.from;
    const fromName = s.from_name || 'Vowflo';
    await t.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: lead.email, subject, text: body });
    res.json({ ok: true, sent_to: lead.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
      from: `"Vowflo" <${fromEmail}>`, to,
      subject: `🎉 New inquiry from ${lead.name || 'a client'}`,
      text: `You have a new lead!\n\nName: ${lead.name}\nEmail: ${lead.email}\nEvent: ${lead.event_type || '-'}\nDate: ${lead.event_date || '-'}\n\nLog in to view: https://alphabetaone.com`,
    });
  } catch { /* never break lead creation over email */ }
}

export default router;
