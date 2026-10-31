import express from 'express';
import { checkPassword, weakAnswer, passwordProblems, breachedCount } from '../lib/passwordPolicy.js';
import { issueCode, useCode, notice, normEmail, emailOk } from '../lib/emailCodes.js';
import { limit, forgive } from '../middleware/rateLimit.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { uniqueVendorSlug } from '../lib/vendorSlug.js';
import { signToken } from '../middleware/auth.js';
import { sendPlatformEmail } from './email.js';
import { revokeToken, revokeAllForUser } from '../lib/tokenRevocation.js';
import { requireAuth } from '../middleware/auth.js';
import { logSecurity, deviceOf } from '../lib/securityLog.js';
import jwt from 'jsonwebtoken';
import { signupsOpen, SIGNUPS_CLOSED_MESSAGE } from '../lib/signups.js';

/* ✉️ Two-step sign-in (Raj, 2026-10-30, option B): the right password on a device the account hasn't trusted gets a
   short ticket and an emailed code instead of a session. The ticket only says "this account passed its password in
   the last 15 minutes" — it opens nothing by itself. A trusted device sends its token and skips the code. */
const TICKET_SECRET = (process.env.JWT_SECRET || 'dev-secret-change-me') + ':two-step';
const TRUST_DAYS = 30;
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const twoStepTicket = (user) => jwt.sign({ uid: user.id }, TICKET_SECRET, { expiresIn: '15m' });
function ticketUser(ticket) {
  try { return jwt.verify(String(ticket || ''), TICKET_SECRET).uid; } catch { return null; }
}
/** "i••••@perfectposes.ca" — enough to know where to look, not a full address on the screen */
const maskEmail = (e) => String(e).replace(/^(.)([^@]*)(@.*)$/, (m, a, b, c) => a + '•'.repeat(Math.min(Math.max(b.length, 3), 6)) + c);
async function trusted(userId, token) {
  if (!token) return false;
  const row = await prisma.trusted_devices.findFirst({ where: { user_id: userId, token_hash: sha256(token), expires_at: { gt: new Date() } }, select: { id: true } }).catch(() => null);
  return !!row;
}
const sessionFor = (user) => ({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, vendor_id: user.vendor_id } });

const router = express.Router();
const TRIAL_LIMIT = 2; // max trials per IP
const APP_URL = process.env.APP_URL || 'https://iwopo.com';

// Get the real client IP (behind nginx proxy)
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '').replace('::ffff:', '');
}

// How many trials this IP has already used
async function trialCount(ip) {
  return prisma.trial_signups.count({ where: { ip_address: ip } });
}

// POST /api/auth/login
/**
 * 🧪 GET /api/auth/qa-session — a Test Vendor session for scripted QA (phone/tablet screenshots), without a password.
 *
 * Exists ONLY where the server's own settings hold QA_SESSION_TOKEN (the staging .env; never live, never in git),
 * answers ONLY on the staging address, and ONLY ever signs in the one account named in QA_SESSION_EMAIL, which must
 * be an ordinary vendor (never a super admin). The key travels in the X-QA-Token header, so it is never written to
 * web logs. Anything else gets a plain 404, exactly as if the route did not exist.
 */
router.get('/qa-session', limit({ name: 'qa-session', max: 30, windowMs: 60_000 }), async (req, res) => {
  const secret = process.env.QA_SESSION_TOKEN || '';
  const email = (process.env.QA_SESSION_EMAIL || '').toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const given = String(req.headers['x-qa-token'] || '');
  const same = secret.length >= 32 && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!secret || !email || host !== 'alphabetaone.com' || !same) return res.status(404).json({ error: 'Not found' });
  const user = await prisma.users.findFirst({ where: { email } });
  if (!user || user.role !== 'vendor' || !user.vendor_id) return res.status(404).json({ error: 'Not found' });
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, vendor_id: user.vendor_id } });
});

/** 🛡️ the account a paused sign-in was aimed at gets a line in its security log */
async function lockedOut(req) {
  const u = await prisma.users.findFirst({ where: { email: { equals: String(req.body?.email || '').trim(), mode: 'insensitive' } }, select: { id: true, vendor_id: true } }).catch(() => null);
  logSecurity(req, u, 'login_locked');
}

router.post('/login',
  // per address, so one machine cannot grind through a password list
  limit({ name: 'login-ip', max: 20, windowMs: 15 * 60_000 }),
  // and per account, so a spread of addresses cannot gang up on one inbox
  limit({ name: 'login-user', max: 8, windowMs: 15 * 60_000, key: r => String(r.body?.email || '').trim().toLowerCase(), perAccount: true, onBlock: lockedOut }),
  async (req, res) => {
  const { password } = req.body;
  const email = String(req.body.email || '').trim();   // ✉️ "Info@…" from a phone keyboard is the same address
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = await prisma.users.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) { logSecurity(req, user, 'login_failed'); return res.status(401).json({ error: 'Invalid credentials' }); }
  if (!user.email_verified_at) {   // ✉️ right password, address not confirmed yet: send (or re-send) the code
    const sent = await issueCode(user.id, 'verify', { to: user.email });
    return res.status(403).json({ error: 'Please confirm your email first — enter the code we sent you.', verify: true, email: user.email, ...(sent.code ? { sandbox_code: sent.code } : {}) });
  }

  // getting in clears the count — a person who mistyped twice then succeeded
  // should not be closer to a lockout than one who typed it right first time
  forgive('login-user', req, String(email).trim().toLowerCase());
  forgive('login-ip', req);

  /* 🔐 Passwords set before today's rules (Raj, 2026-10-23): the right password, but too weak or found in a data breach
     → no session yet; a 15-minute one-time ticket to choose a stronger one, then straight in. The test site can switch
     this off (PASSWORD_UPGRADE=off) so testers keep simple passwords there. */
  if (process.env.PASSWORD_UPGRADE !== 'off') {
    const weak = passwordProblems(password, { email: user.email, name: user.name });
    if (weak.length || (await breachedCount(password)) > 0) {
      const ticket = crypto.randomBytes(32).toString('hex');
      await prisma.password_reset_tokens.create({ data: { user_id: user.id, token_hash: crypto.createHash('sha256').update(ticket).digest('hex'), expires_at: new Date(Date.now() + 15 * 60_000) } });
      return res.status(403).json({ error: 'Please choose a stronger password to continue.', upgrade: true, ticket });
    }
  }

  /* ✉️ a device this account hasn't trusted: the emailed code first.
     🚨 Emergency switch: TWO_STEP=off in backend/.env (then restart) turns this off for everyone — for when email
     can't be sent at all and no one could receive a code. Off only by choice; anything else leaves it on. */
  if (process.env.TWO_STEP !== 'off' && !(await trusted(user.id, req.body.device_token))) {
    const sent = await issueCode(user.id, 'login', { to: user.email });
    if (sent.error) return res.status(502).json({ error: 'We could not send your sign-in code just now. Please try again in a minute.' });
    if (!sent.tooSoon) logSecurity(req, user, 'two_step_sent');   // within 45 s the code already sent still works
    return res.json({ two_step: true, ticket: twoStepTicket(user), email: maskEmail(user.email), ...(sent.code ? { sandbox_code: sent.code } : {}) });
  }
  logSecurity(req, user, 'login_ok');
  res.json(sessionFor(user));
});

/* ✉️ POST /api/auth/login/code { ticket, code, remember } — the emailed code finishes the sign-in */
router.post('/login/code', limit({ name: 'login-code', max: 15, windowMs: 15 * 60_000 }), async (req, res) => {
  const uid = ticketUser(req.body.ticket);
  if (!uid) return res.status(400).json({ error: 'This sign-in has expired — please sign in again.' });
  const user = await prisma.users.findUnique({ where: { id: uid } });
  if (!user) return res.status(400).json({ error: 'This sign-in has expired — please sign in again.' });
  try { await useCode(user.id, 'login', req.body.code); }
  catch (e) { logSecurity(req, user, 'two_step_failed'); return res.status(400).json({ error: e.message }); }
  let device_token;
  if (req.body.remember) {
    device_token = crypto.randomBytes(32).toString('hex');
    await prisma.trusted_devices.create({ data: {
      user_id: user.id, token_hash: sha256(device_token), device: deviceOf(req.headers['user-agent']).slice(0, 120),
      expires_at: new Date(Date.now() + TRUST_DAYS * 864e5),
    } });
    logSecurity(req, user, 'device_remembered');
  }
  logSecurity(req, user, 'login_ok');
  res.json({ ...sessionFor(user), ...(device_token ? { device_token } : {}) });
});

/* ✉️ POST /api/auth/login/resend { ticket } — a fresh sign-in code */
router.post('/login/resend', limit({ name: 'login-resend', max: 6, windowMs: 60 * 60_000 }), async (req, res) => {
  const uid = ticketUser(req.body.ticket);
  const user = uid ? await prisma.users.findUnique({ where: { id: uid }, select: { id: true, email: true, vendor_id: true } }) : null;
  if (!user) return res.status(400).json({ error: 'This sign-in has expired — please sign in again.' });
  const sent = await issueCode(user.id, 'login', { to: user.email });
  if (sent.tooSoon) return res.status(429).json({ error: 'Please wait a little before asking for another code.' });
  if (sent.error) return res.status(502).json({ error: 'We could not send a new code just now. Please try again in a minute.' });
  logSecurity(req, user, 'two_step_sent');
  res.json({ ok: true, ...(sent.code ? { sandbox_code: sent.code } : {}) });
});

// GET /api/auth/trial-eligible  → tells frontend if this IP can still start a trial
router.get('/trial-eligible', async (req, res) => {
  const used = await trialCount(clientIp(req));
  res.json({ eligible: used < TRIAL_LIMIT, used, limit: TRIAL_LIMIT, open: await signupsOpen() });   // 🚧 sign-ups paused?
});

// POST /api/auth/signup  (public - from Selling Platform)
router.post('/signup', limit({ name: 'signup', max: 6, windowMs: 60 * 60_000 }), async (req, res) => {
  // 🚧 paused until launch — refused here, whatever the page shows (lib/signups.js)
  if (!(await signupsOpen())) return res.status(403).json({ error: SIGNUPS_CLOSED_MESSAGE, code: 'signups_closed' });
  const { businessName, name, email, password, plan } = req.body;
  if (!businessName || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (!emailOk(normEmail(email))) return res.status(400).json({ error: 'That is not a valid email address — check it has an @ and a domain, like name@example.com.' });
  const weak = await checkPassword(password, { email, name, business: businessName });   // 🔐 the shared password rules
  if (weak.length) return res.status(400).json(weakAnswer(weak));

  const isPaid = plan && plan !== 'trial';
  const ip = clientIp(req);

  // Trial limit only applies to TRIAL signups (paid always allowed)
  if (!isPaid) {
    const used = await trialCount(ip);
    if (used >= TRIAL_LIMIT) {
      return res.status(429).json({
        error: 'trial_limit',
        message: `You've used all ${TRIAL_LIMIT} free trials. Please choose a paid plan to continue. 💳`
      });
    }
  }

  const exists = await prisma.users.findFirst({ where: { email }, select: { id: true } });
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 12);
  try {
    // All-or-nothing: a half-finished signup used to be possible (vendor created,
    // then the user insert fails → orphaned tenant). A transaction prevents that.
    const created = await prisma.$transaction(async (tx) => {
      // 1. Create vendor (tenant)
      const vendor = await tx.vendors.create({
        data: {
          business_name: businessName,
          slug: await uniqueVendorSlug(tx, businessName),
          /* ⚠️ vendors.plan used to be set here and read by the storage quota,
             which is how a paying vendor could be capped at the trial
             allowance: this wrote the name of a plan but never created the
             SUBSCRIPTION that grants it. The subscription is made below and is
             the only thing that decides what anybody gets. */
          status: isPaid ? 'active' : 'trial',
          signup_ip: ip,
        },
        select: { id: true },
      });

      // 2. Create vendor user linked to that tenant
      const user = await tx.users.create({
        data: {
          name: name || businessName,
          email,
          password_hash: hash,
          role: 'vendor',
          vendor_id: vendor.id,
        },
        select: { id: true, name: true, role: true, vendor_id: true },
      });

      /* 3. The subscription itself, for a paid signup.
            Looked up by code rather than trusted from the body, so a caller
            inventing a plan name gets a trial rather than an allowance. */
      if (isPaid) {
        const chosen = await tx.plans.findFirst({ where: { code: String(plan) }, select: { id: true } });
        if (chosen) {
          await tx.vendor_subscriptions.create({
            data: { vendor_id: vendor.id, plan_id: chosen.id, status: 'active', started_at: new Date() },
          });
        }
      }

      // 4. Record trial against IP (only for trials)
      if (!isPaid) {
        await tx.trial_signups.create({
          data: { ip_address: ip, email, vendor_id: vendor.id },
        });
      }

      // 4. Referral reward — if this email was referred AND signed up PAID → reward both 🎁
      if (isPaid) {
        await tx.referrals.updateMany({
          where: { friend_email: email, status: 'pending' },
          data: { status: 'rewarded', friend_vendor_id: vendor.id, rewarded_at: new Date() },
        });
      }

      return user;
    });

    // ✉️ the account works once the address is confirmed with the emailed code
    await prisma.users.update({ where: { id: created.id }, data: { email_verified_at: null } });
    const sent = await issueCode(created.id, 'verify', { to: created.email });
    res.status(201).json({ verify: true, email: created.email, ...(sent.code ? { sandbox_code: sent.code } : {}), ...(sent.error ? { not_sent: true } : {}) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/forgot  → email a reset link (always responds ok, to avoid leaking which emails exist)
router.post('/forgot', limit({ name: 'forgot', max: 6, windowMs: 60 * 60_000 }), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const user = await prisma.users.findFirst({
      where: { email },
      select: { id: true, name: true, role: true },
    });
    // Only send for real accounts; still return ok either way.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.password_reset_tokens.create({
        data: {
          user_id: user.id,
          token_hash: hash,
          expires_at: new Date(Date.now() + 3600 * 1000),   // NOW() + INTERVAL '1 hour'
        },
      });
      const link = `${APP_URL}/reset-password?token=${token}`;
      try {
        await sendPlatformEmail(
          email,
          'Reset your iwopo password',
          `Hi ${user.name || ''},\n\nReset your password using this link (valid for 1 hour):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
          `<p>Hi ${user.name || ''},</p><p>Reset your password using the link below (valid for 1 hour):</p><p><a href="${link}">Reset my password</a></p><p>If you didn't request this, you can ignore this email.</p>`
        );
      } catch (e) {
        // Platform email not configured yet → surface a clear message in dev
        if (e.code === 'no_platform_smtp')
          return res.status(200).json({ ok: true, pending: true, message: 'Reset recorded, but platform email is not set up yet. ⚙️' });
        throw e;
      }
    }
    res.json({ ok: true, message: 'If that email exists, a reset link is on its way. 📬' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/reset  → set a new password using a valid token
router.post('/reset', limit({ name: 'reset', max: 10, windowMs: 60 * 60_000 }), async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
  const weak = await checkPassword(password);   // 🔐 the shared password rules
  if (weak.length) return res.status(400).json(weakAnswer(weak));
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await prisma.password_reset_tokens.findFirst({
      where: { token_hash: hash, used_at: null, expires_at: { gt: new Date() } },
      select: { id: true, user_id: true },
    });
    if (!row) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    const newHash = await bcrypt.hash(password, 12);
    // both writes together — the token must not be burned unless the password changed
    await prisma.$transaction([
      prisma.users.update({ where: { id: row.user_id }, data: { password_hash: newHash } }),
      prisma.password_reset_tokens.update({ where: { id: row.id }, data: { used_at: new Date() } }),
    ]);
    /* 🎟️ Every session issued before now ends. A reset is usually "I lost
       access" or "someone else has it" — leaving their logged-in browser
       working for another seven days defeats the point. PUT /me/password
       already did this; the reset path did not. */
    await revokeAllForUser(row.user_id);
    const who = await prisma.users.findUnique({ where: { id: row.user_id }, select: { email: true, vendor_id: true } });
    logSecurity(req, { id: row.user_id, vendor_id: who?.vendor_id }, 'password_reset');
    notice(who?.email, 'Your iwopo password was changed', ['The password for your iwopo account was just reset, and every device was signed out.']);
    res.json({ ok: true, message: 'Password updated — you can log in now. ✅' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Password changes live at PUT /api/me/password. This file used to carry a
// second, identical implementation at POST /auth/change-password — nothing
// called it, and two ways to change a password means two things to keep right.

/**
 * 🎟️ POST /api/auth/logout — cancel THIS token.
 *
 * There was no server-side logout at all: the panel cleared its own storage and
 * the token stayed perfectly valid for the rest of its seven days. Anyone
 * holding a copy could carry on.
 *
 * Only this token is cancelled, deliberately — signing out on a phone should
 * not sign out the desktop. Cancelling everything is what a password change
 * does.
 */
/* ✉️ POST /api/auth/verify { email, code } — confirm the address and sign in */
router.post('/verify', limit({ name: 'verify', max: 20, windowMs: 15 * 60_000 }), async (req, res) => {
  try {
    const user = await prisma.users.findFirst({ where: { email: { equals: normEmail(req.body.email), mode: 'insensitive' } } });
    if (!user) return res.status(400).json({ error: 'That code is not right.' });
    if (user.email_verified_at) return res.status(400).json({ error: 'This email is already confirmed — sign in with your password.' });
    await useCode(user.id, 'verify', req.body.code);
    const done = await prisma.users.update({ where: { id: user.id }, data: { email_verified_at: new Date() } });
    logSecurity(req, done, 'email_confirmed');
    res.json({ token: signToken(done), user: { id: done.id, name: done.name, email: done.email, role: done.role, vendor_id: done.vendor_id } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ✉️ POST /api/auth/resend { email } — a new code; the same answer whether or not the address has an account */
router.post('/resend', limit({ name: 'resend', max: 6, windowMs: 60 * 60_000 }), async (req, res) => {
  const message = 'If that address is waiting to be confirmed, a new code is on its way. 📬';
  try {
    const user = await prisma.users.findFirst({ where: { email: { equals: normEmail(req.body.email), mode: 'insensitive' } } });
    if (!user || user.email_verified_at) return res.json({ ok: true, message });
    const sent = await issueCode(user.id, 'verify', { to: user.email });
    if (sent.tooSoon) return res.status(429).json({ error: 'Please wait a little before asking for another code.' });
    res.json({ ok: true, message, ...(sent.code ? { sandbox_code: sent.code } : {}) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', requireAuth, async (req, res) => {
  await revokeToken(req.user);
  res.json({ ok: true });
});

/**
 * 🚨 POST /api/auth/logout-everywhere — cancel every token this user holds.
 *
 * For the case that actually matters: a lost laptop, or "I think someone got
 * into my account". Precision is the wrong instinct there.
 */
router.post('/logout-everywhere', requireAuth, async (req, res) => {
  await revokeAllForUser(req.user.id);
  res.json({ ok: true });
});

export default router;
