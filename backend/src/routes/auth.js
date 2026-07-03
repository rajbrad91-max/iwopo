import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { signToken } from '../middleware/auth.js';

const router = express.Router();

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
    user: { id: user.id, name: user.name, role: user.role, vendor_id: user.vendor_id }
  });
});

// POST /api/auth/signup  (public - from Selling Platform)
router.post('/signup', async (req, res) => {
  const { businessName, name, email, password } = req.body;
  if (!businessName || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

  // 1. Create vendor (tenant)
  const v = await query(
    `INSERT INTO vendors (business_name, plan, status) VALUES ($1,'starter','trial') RETURNING id`,
    [businessName]
  );
  const vendorId = v.rows[0].id;

  // 2. Create vendor user linked to that tenant
  const hash = await bcrypt.hash(password, 10);
  const u = await query(
    `INSERT INTO users (name, email, password_hash, role, vendor_id)
     VALUES ($1,$2,$3,'vendor',$4) RETURNING id, name, role, vendor_id`,
    [name || businessName, email, hash, vendorId]
  );

  res.status(201).json({ token: signToken(u.rows[0]), user: u.rows[0] });
});

export default router;
