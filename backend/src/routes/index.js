import express from 'express';
import geoip from 'geoip-lite';
import { query } from '../config/db.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { getAllSettings, setSetting } from '../lib/settings.js';

const router = express.Router();

// 🔒 Super admin: platform settings (face engine + AWS creds)
router.get('/settings/platform', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const s = await getAllSettings();
    // mask secret
    if (s.aws_secret_key) s.aws_secret_key = s.aws_secret_key.slice(0, 4) + '••••••••' + s.aws_secret_key.slice(-4);
    res.json({ settings: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔓 Super admin: reveal full AWS creds (edit-mode eye toggle)
router.get('/settings/platform/reveal', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const s = await getAllSettings();
    res.json({ aws_access_key: s.aws_access_key || '', aws_secret_key: s.aws_secret_key || '', aws_region: s.aws_region || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings/platform', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const allowed = ['face_engine', 'aws_access_key', 'aws_secret_key', 'aws_region'];
    for (const k of allowed) {
      if (req.body[k] !== undefined && req.body[k] !== '' && !String(req.body[k]).includes('••••')) {
        await setSetting(k, req.body[k]);
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌍 currency symbol per country
const CURRENCY = { US:'$', CA:'C$', GB:'£', IN:'₹', AU:'A$', EU:'€' };

// resolve a visitor's geo → { code, currency }
function geoFrom(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const g = geoip.lookup(ip);
  if (!g) return { code: 'default', region: null, currency: '$' };
  // British Columbia exception → CA-BC
  const code = (g.country === 'CA' && g.region === 'BC') ? 'CA-BC' : g.country;
  const currency = CURRENCY[g.country] || '$';
  return { code, region: g.region, currency };
}

// pick the right price for a row given geo
// pick monthly+annual for a row given geo. country_prices values can be:
//   number (monthly only)  OR  { m: monthly, y: annual }
function geoPrice(row, geo, baseField = 'price', baseAnnualField = 'price_annual') {
  const cp = row.country_prices || {};
  let entry;
  if (geo.code !== 'default' && cp[geo.code] != null) entry = cp[geo.code];
  else if (geo.code === 'CA-BC' && cp['CA'] != null) entry = cp['CA'];
  else if (cp.default != null) entry = cp.default;

  if (entry != null) {
    if (typeof entry === 'object') return { m: Number(entry.m), y: entry.y != null ? Number(entry.y) : null };
    return { m: Number(entry), y: null }; // legacy number = monthly only
  }
  return { m: Number(row[baseField]), y: row[baseAnnualField] != null ? Number(row[baseAnnualField]) : null };
}

function priceFor(row, geo, baseField = 'price') {
  return geoPrice(row, geo, baseField).m;
}

router.get('/hello', (req, res) => {
  res.json({ message: 'Hello from Vowflo API! 👋' });
});

// 🔔 Super admin: live notification counts (topbar icons)
router.get('/admin/counts', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const msgs = await query(`SELECT count(*)::int n FROM support_messages WHERE seen=false AND status='open'`);
    const paid = await query(`SELECT count(*)::int n FROM vendors WHERE status='active' AND seen_by_admin=false`);
    const trial = await query(`SELECT count(*)::int n FROM vendors WHERE status='trial' AND seen_by_admin=false`);
    res.json({ messages: msgs.rows[0].n, paid: paid.rows[0].n, trials: trial.rows[0].n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔔 mark a group seen: 'messages' | 'paid' | 'trials'
router.put('/admin/counts/:group/seen', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    if (req.params.group === 'messages') await query(`UPDATE support_messages SET seen=true WHERE seen=false`);
    else if (req.params.group === 'paid') await query(`UPDATE vendors SET seen_by_admin=true WHERE status='active'`);
    else if (req.params.group === 'trials') await query(`UPDATE vendors SET seen_by_admin=true WHERE status='trial'`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📨 support messages list (super admin)
router.get('/admin/messages', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query(`SELECT * FROM support_messages ORDER BY created_at DESC`);
  res.json({ messages: rows });
});

// 📨 public: submit a support message
router.post('/support', async (req, res) => {
  const { from_email, subject, body, vendor_id } = req.body;
  if (!from_email || !body) return res.status(400).json({ error: 'Email + message required' });
  try {
    await query(`INSERT INTO support_messages (vendor_id, from_email, subject, body) VALUES ($1,$2,$3,$4)`,
      [vendor_id || null, from_email, subject || null, body]);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: full services incl. country_prices (for editor)
router.get('/admin/services', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM services ORDER BY id');
  res.json({ services: rows });
});

// Public: list all services (legacy) — geo-priced
router.get('/services', async (req, res) => {
  const geo = geoFrom(req);
  const { rows } = await query('SELECT * FROM services ORDER BY id');
  const services = rows.map(s => {
    const gp = geoPrice(s, geo);
    const { country_prices, ...pub } = s; // 🔒 don't expose all-country pricing publicly
    return { ...pub, price: gp.m, price_annual: gp.y ?? s.price_annual, currency: geo.currency, geo_code: geo.code };
  });
  res.json({ services, geo: geo.code, currency: geo.currency });
});

// Public: packages (3 tiers) with their items nested
router.get('/packages', async (req, res) => {
  try {
    const geo = geoFrom(req);
    const { rows: packages } = await query('SELECT * FROM packages ORDER BY sort_order');
    const { rows: items } = await query('SELECT * FROM package_items ORDER BY package_id, sort_order');
    const result = packages.map(p => {
      const gp = p.price_monthly != null ? geoPrice(p, geo, 'price_monthly', 'price_annual') : { m: p.price_monthly, y: p.price_annual };
      const { country_prices, ...pub } = p; // 🔒 hide all-country pricing from public
      return {
      ...pub,
      price_monthly: gp.m,
      price_annual: gp.y ?? p.price_annual,
      currency: geo.currency,
      included: items.filter(i => i.package_id === p.id && i.is_included),
      addons: items.filter(i => i.package_id === p.id && i.is_addon),
      standalone: items.filter(i => i.package_id === p.id && !i.is_included && !i.is_addon),
      };
    });
    res.json({ packages: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔒 Super admin: full packages incl. country_prices (for editor)
router.get('/admin/packages', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows: packages } = await query('SELECT * FROM packages ORDER BY sort_order');
  const { rows: items } = await query('SELECT * FROM package_items ORDER BY package_id, sort_order');
  const result = packages.map(p => ({
    ...p,
    included: items.filter(i => i.package_id === p.id && i.is_included),
    addons: items.filter(i => i.package_id === p.id && i.is_addon),
    standalone: items.filter(i => i.package_id === p.id && !i.is_included && !i.is_addon),
  }));
  res.json({ packages: result });
});

// 🔒 Super admin: update a PACKAGE price
router.put('/packages/:id/price', requireAuth, requireSuperAdmin, async (req, res) => {
  const { price_monthly, price_annual, price_annual_regular } = req.body;
  try {
    await query(
      `UPDATE packages SET price_monthly=$1, price_annual=$2, price_annual_regular=$3 WHERE id=$4`,
      [price_monthly ?? null, price_annual ?? null, price_annual_regular ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: update a PACKAGE ITEM price
router.put('/package-items/:id/price', requireAuth, requireSuperAdmin, async (req, res) => {
  const { price_monthly, price_annual, price_annual_regular } = req.body;
  try {
    await query(
      `UPDATE package_items SET price_monthly=$1, price_annual=$2, price_annual_regular=$3 WHERE id=$4`,
      [price_monthly ?? null, price_annual ?? null, price_annual_regular ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: update a STANDALONE SERVICE price
router.put('/services/:id/price', requireAuth, requireSuperAdmin, async (req, res) => {
  const { price, price_annual, price_annual_regular } = req.body;
  try {
    await query(
      `UPDATE services SET price=$1, price_annual=$2, price_annual_regular=$3 WHERE id=$4`,
      [price ?? 0, price_annual ?? null, price_annual_regular ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: update a service's tiers (jsonb array)
router.put('/services/:id/tiers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { tiers } = req.body;
  try {
    await query(`UPDATE services SET tiers=$1 WHERE id=$2`, [JSON.stringify(tiers || []), req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: set country-specific prices (services or packages)
// body: { type:'service'|'package', country_prices:{ default:14.99, CA:18, 'CA-BC':20 } }
router.put('/country-prices/:type/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { type, id } = req.params;
  const { country_prices } = req.body;
  const table = type === 'package' ? 'packages' : 'services';
  try {
    await query(`UPDATE ${table} SET country_prices=$1 WHERE id=$2`, [JSON.stringify(country_prices || {}), id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🎁 OFFERS
// Public: list active offers
// 🔒 Super admin: list all offers (coupons are internal)
router.get('/offers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM offers ORDER BY created_at DESC');
  res.json({ offers: rows });
});

// 🔒 Create offer
router.post('/offers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { code, label, percent_off, starts_at, ends_at, applies_to } = req.body;
  if (!code || !percent_off) return res.status(400).json({ error: 'Missing code or percent' });
  try {
    const { rows } = await query(
      `INSERT INTO offers (code,label,percent_off,starts_at,ends_at,applies_to)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code.toUpperCase(), label || null, percent_off, starts_at || null, ends_at || null, applies_to || 'all']
    );
    res.status(201).json({ offer: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Code already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Public: validate a coupon code (for checkout)
// applies_to: 'all' | 'service:ID' | 'package:ID'
router.get('/offers/validate/:code', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM offers WHERE code=$1 AND active=true
       AND (starts_at IS NULL OR starts_at<=CURRENT_DATE)
       AND (ends_at IS NULL OR ends_at>=CURRENT_DATE)`,
      [req.params.code.toUpperCase()]
    );
    if (!rows[0]) return res.status(404).json({ valid: false, error: 'Invalid or expired code' });
    const offer = rows[0];
    // optional target check: ?target=service:12 or package:1
    const { target } = req.query;
    if (offer.applies_to !== 'all' && target && offer.applies_to !== target) {
      return res.status(400).json({ valid: false, error: 'Code not valid for this item' });
    }
    res.json({ valid: true, code: offer.code, percent_off: offer.percent_off, applies_to: offer.applies_to });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Toggle / delete offer
router.put('/offers/:id/toggle', requireAuth, requireSuperAdmin, async (req, res) => {
  await query('UPDATE offers SET active = NOT active WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
router.delete('/offers/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  await query('DELETE FROM offers WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// 👥 REFERRALS (email-based, reward on paid signup)
// Public: create a referral (existing user refers a friend's email)
router.post('/referrals', async (req, res) => {
  const { referrer_email, friend_email } = req.body;
  if (!referrer_email || !friend_email) return res.status(400).json({ error: 'Both emails required' });
  if (referrer_email.toLowerCase() === friend_email.toLowerCase())
    return res.status(400).json({ error: "Can't refer yourself" });
  try {
    // friend must be NEW (not already a user)
    const exists = await query('SELECT id FROM users WHERE email=$1', [friend_email]);
    if (exists.rows.length) return res.status(409).json({ error: 'That email already has an account' });
    const { rows } = await query(
      `INSERT INTO referrals (referrer_email, friend_email) VALUES ($1,$2) RETURNING *`,
      [referrer_email, friend_email]
    );
    res.status(201).json({ referral: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: list all referrals
router.get('/referrals', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM referrals ORDER BY created_at DESC');
  res.json({ referrals: rows });
});

export default router;
