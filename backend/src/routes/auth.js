import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { signToken } from '../middleware/auth.js';
import { sendPlatformEmail } from './email.js';

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
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = await prisma.users.findFirst({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, vendor_id: user.vendor_id }
  });
});

// GET /api/auth/trial-eligible  → tells frontend if this IP can still start a trial
router.get('/trial-eligible', async (req, res) => {
  const used = await trialCount(clientIp(req));
  res.json({ eligible: used < TRIAL_LIMIT, used, limit: TRIAL_LIMIT });
});

// POST /api/auth/signup  (public - from Selling Platform)
router.post('/signup', async (req, res) => {
  const { businessName, name, email, password, plan } = req.body;
  if (!businessName || !email || !password) return res.status(400).json({ error: 'Missing fields' });

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

  const hash = await bcrypt.hash(password, 10);
  try {
    // All-or-nothing: a half-finished signup used to be possible (vendor created,
    // then the user insert fails → orphaned tenant). A transaction prevents that.
    const created = await prisma.$transaction(async (tx) => {
      // 1. Create vendor (tenant)
      const vendor = await tx.vendors.create({
        data: {
          business_name: businessName,
          plan: isPaid ? plan : 'starter',
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

      // 3. Record trial against IP (only for trials)
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

    res.status(201).json({ token: signToken(created), user: created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/forgot  → email a reset link (always responds ok, to avoid leaking which emails exist)
router.post('/forgot', async (req, res) => {
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
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await prisma.password_reset_tokens.findFirst({
      where: { token_hash: hash, used_at: null, expires_at: { gt: new Date() } },
      select: { id: true, user_id: true },
    });
    if (!row) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    const newHash = await bcrypt.hash(password, 10);
    // both writes together — the token must not be burned unless the password changed
    await prisma.$transaction([
      prisma.users.update({ where: { id: row.user_id }, data: { password_hash: newHash } }),
      prisma.password_reset_tokens.update({ where: { id: row.id }, data: { used_at: new Date() } }),
    ]);
    res.json({ ok: true, message: 'Password updated — you can log in now. ✅' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Password changes live at PUT /api/me/password. This file used to carry a
// second, identical implementation at POST /auth/change-password — nothing
// called it, and two ways to change a password means two things to keep right.

export default router;
