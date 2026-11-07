/**
 * ✉️ Email codes — prove a person owns an address (Raj, 2026-10-23).
 *  - 'verify': a new account's address, before it can sign in
 *  - 'change': a new address for an existing account, before the switch
 * Six digits, stored only as a keyed hash, valid 15 minutes, five tries; a new code replaces the last one.
 * Staging (MAIL_SANDBOX=1): nothing is emailed — the code comes back in the answer so the screens can be tested.
 */
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { sendPlatformEmail } from '../routes/email.js';
import { quiet } from './quiet.js';
import { emailShell, emailText, emailCode, emailButton, esc } from './emailLayout.js';

const TTL_MS = 15 * 60_000, MAX_TRIES = 5, RESEND_GAP_MS = 45_000;
export const mailSandbox = () => process.env.MAIL_SANDBOX === '1';
const keyed = (code, userId, purpose) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'iwopo').update(`${userId}:${purpose}:${code}`).digest('hex');
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

/** A fresh code for this person and purpose (the previous one stops working). Returns { code, sent, sandbox, error }. */
export async function issueCode(userId, purpose, { newEmail = null, to } = {}) {
  const last = await prisma.email_codes.findFirst({ where: { user_id: userId, purpose, used_at: null }, orderBy: { created_at: 'desc' } });
  if (last && Date.now() - last.created_at.getTime() < RESEND_GAP_MS) return { tooSoon: true };
  await prisma.email_codes.updateMany({ where: { user_id: userId, purpose, used_at: null }, data: { used_at: new Date() } });
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.email_codes.create({ data: { user_id: userId, purpose, code_hash: keyed(code, userId, purpose), new_email: newEmail, expires_at: new Date(Date.now() + TTL_MS) } });
  if (mailSandbox()) return { code, sandbox: true, sent: false };
  try {
    const { subject, text, html } = codeMail(code, purpose, to);
    await sendPlatformEmail(to, subject, text, html);
    return { sent: true };
  } catch (e) { return { sent: false, error: e.code === 'no_platform_smtp' ? 'not_configured' : e.message }; }
}

/** Check a code. Returns the row on success; throws a friendly error otherwise. */
export async function useCode(userId, purpose, code) {
  const row = await prisma.email_codes.findFirst({ where: { user_id: userId, purpose, used_at: null }, orderBy: { created_at: 'desc' } });
  if (!row || row.expires_at < new Date()) throw new Error('That code has expired. Ask for a new one.');
  if (row.attempts >= MAX_TRIES) throw new Error('Too many wrong tries. Ask for a new code.');
  const given = String(code || '').replace(/\D/g, '');
  const ok = given.length === 6 && crypto.timingSafeEqual(Buffer.from(keyed(given, userId, purpose)), Buffer.from(row.code_hash));
  if (!ok) {
    await prisma.email_codes.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new Error(`That code is not right. ${Math.max(0, MAX_TRIES - row.attempts - 1)} tries left.`);
  }
  await prisma.email_codes.update({ where: { id: row.id }, data: { used_at: new Date() } });
  return row;
}

/** Security notices ("your password was changed"…). Never throws; skipped on staging. */
export async function notice(to, subject, lines) {
  if (mailSandbox() || !to) return;
  const text = `${lines.join('\n\n')}\n\nIf this wasn't you, reset your password straight away and contact iwopo support.\n\n— iwopo`;
  const html = emailShell({ title: subject, preheader: lines[0] || subject, body: lines.map(l => emailText(esc(l))).join('')
    + emailText("If this wasn't you, reset your password straight away and contact iwopo support.", { muted: true }) });
  await sendPlatformEmail(to, subject, text, html).catch(quiet('emailCodes · sendPlatformEmail'));
}

function codeMail(code, purpose, to) {
  // ✉️ two-step sign-in: no link — the code must be typed where the password was
  if (purpose === 'login') {
    const lead = 'Use this code to finish signing in to iwopo:';
    const warn = "It works for 15 minutes. If this wasn't you, someone knows your password — change it in iwopo → Settings → Account.";
    return {
      subject: `${code} is your iwopo sign-in code`,
      text: `${lead}\n\n${code}\n\n${warn}\n\n— iwopo`,
      html: emailShell({ title: 'Your sign-in code', preheader: `${code} — your iwopo sign-in code`, body: emailText(esc(lead)) + emailCode(code) + emailText(esc(warn), { muted: true }) }),
    };
  }
  const link = `${process.env.APP_URL || 'https://iwopo.com'}/verify?email=${encodeURIComponent(to || '')}&code=${code}`;
  const subject = purpose === 'change' ? `${code} is your code to confirm your new email` : `${code} is your iwopo verification code`;
  const lead = purpose === 'change' ? 'Use this code to confirm your new email address on iwopo:' : 'Welcome to iwopo! Use this code to confirm your email address:';
  const text = `${lead}\n\n${code}\n\n${purpose === 'change' ? '' : `Or open: ${link}\n\n`}It works for 15 minutes. If you didn't ask for this, you can ignore this email.\n\n— iwopo`;
  const html = emailShell({ title: purpose === 'change' ? 'Confirm your new email' : 'Confirm your email', preheader: `${code} — ${lead}`, body:
    emailText(esc(lead)) + emailCode(code)
    + (purpose === 'change' ? '' : emailButton(link, 'Confirm my email', true))
    + emailText("It works for 15 minutes. If you didn't ask for this, you can ignore this email.", { muted: true }) });
  return { subject, text, html };
}
