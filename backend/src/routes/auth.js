import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { signToken } from '../middleware/auth.js';

const router = express.Router();
const TRIAL_LIMIT = 2; // max trials per IP

// Get the real client IP (behind nginx proxy)
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '').replace('::ffff:', '');
}

// How many trials this IP has already used
async function trialCount(ip) {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM trial_signups WHERE ip_address=$1', [ip]);
  return rows[0].n;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const { rows } = await query('SELECT * FROM users WHERE email=$1', [email]);
  const user = rows[0];
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

  const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

  // 1. Create vendor (tenant)
  const v = await query(
    `INSERT INTO vendors (business_name, plan, status, signup_ip) VALUES ($1,$2,$3,$4) RETURNING id`,
    [businessName, isPaid ? plan : 'starter', isPaid ? 'active' : 'trial', ip]
  );
  const vendorId = v.rows[0].id;

  // 2. Create vendor user linked to that tenant
  const hash = await bcrypt.hash(password, 10);
  const u = await query(
    `INSERT INTO users (name, email, password_hash, role, vendor_id)
     VALUES ($1,$2,$3,'vendor',$4) RETURNING id, name, role, vendor_id`,
    [name || businessName, email, hash, vendorId]
  );

  // 3. Record trial against IP (only for trials)
  if (!isPaid) {
    await query(`INSERT INTO trial_signups (ip_address, email, vendor_id) VALUES ($1,$2,$3)`,
      [ip, email, vendorId]);
  }

  // 4. Referral reward — if this email was referred AND signed up PAID → reward both 🎁
  if (isPaid) {
    await query(
      `UPDATE referrals SET status='rewarded', friend_vendor_id=$1, rewarded_at=NOW()
       WHERE friend_email=$2 AND status='pending'`,
      [vendorId, email]
    );
  }

  res.status(201).json({ token: signToken(u.rows[0]), user: u.rows[0] });
});

export default router;
