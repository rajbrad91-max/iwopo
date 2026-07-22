import express from 'express';
import geoip from 'geoip-lite';
import prisma from '../config/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { getAllSettings, setSetting } from '../lib/settings.js';
import { queueStatus } from '../lib/faceQueue.js';

const router = express.Router();

// 🧵 Super admin: live face-queue status (backlog, load, concurrency, aws mode)
router.get('/face-queue/status', requireAuth, requireSuperAdmin, async (req, res) => {
  try { res.json(await queueStatus()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: platform settings (face engine + AWS creds)
router.get('/settings/platform', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const s = await getAllSettings();
    // mask secret
    if (s.aws_secret_key) s.aws_secret_key = s.aws_secret_key.slice(0, 4) + '••••••••' + s.aws_secret_key.slice(-4);
    if (s.anthropic_api_key) s.anthropic_api_key = s.anthropic_api_key.slice(0, 7) + '••••••••' + s.anthropic_api_key.slice(-4);
    res.json({ settings: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔄 Super admin: reset ALL face indexing (for engine switch → re-index)
router.post('/settings/reindex-all', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const r = await prisma.photos.updateMany({
      data: { faces: null, face_count: 0, face_indexed: false, face_engine: null },
    });
    // clear per-album engine locks + cluster flags so each album re-picks fresh on next index
    await prisma.albums.updateMany({ data: { face_engine_lock: null, faces_clustered: false } });
    await prisma.photo_faces.deleteMany({});
    await prisma.face_clusters.deleteMany({});
    res.json({ ok: true, reset: r.count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔓 Super admin: reveal full AWS creds (edit-mode eye toggle)
router.get('/settings/platform/reveal', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const s = await getAllSettings();
    res.json({ aws_access_key: s.aws_access_key || '', aws_secret_key: s.aws_secret_key || '', aws_region: s.aws_region || '', anthropic_api_key: s.anthropic_api_key || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings/platform', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const allowed = ['face_engine', 'aws_mode', 'aws_access_key', 'aws_secret_key', 'aws_region', 'anthropic_api_key', 'anthropic_model'];
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
  res.json({ message: 'Hello from iwopo API! 👋' });
});

// 🔔 Super admin: live notification counts (topbar icons)
router.get('/admin/counts', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [messages, paid, trials] = await Promise.all([
      prisma.support_messages.count({ where: { seen: false, status: 'open' } }),
      prisma.vendors.count({ where: { status: 'active', seen_by_admin: false } }),
      prisma.vendors.count({ where: { status: 'trial', seen_by_admin: false } }),
    ]);
    res.json({ messages, paid, trials });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔔 mark a group seen: 'messages' | 'paid' | 'trials'
router.put('/admin/counts/:group/seen', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    if (req.params.group === 'messages') await prisma.support_messages.updateMany({ where: { seen: false }, data: { seen: true } });
    else if (req.params.group === 'paid') await prisma.vendors.updateMany({ where: { status: 'active' }, data: { seen_by_admin: true } });
    else if (req.params.group === 'trials') await prisma.vendors.updateMany({ where: { status: 'trial' }, data: { seen_by_admin: true } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📨 support messages list (super admin)
router.get('/admin/messages', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const messages = await prisma.support_messages.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📨 public: submit a support message
router.post('/support', async (req, res) => {
  const { from_email, subject, body, vendor_id } = req.body;
  if (!from_email || !body) return res.status(400).json({ error: 'Email + message required' });
  try {
    await prisma.support_messages.create({
      data: { vendor_id: vendor_id ? Number(vendor_id) : null, from_email, subject: subject || null, body },
    });
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: full services incl. country_prices (for editor)
router.get('/admin/services', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const services = await prisma.services.findMany({ orderBy: { id: 'asc' } });
    res.json({ services });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Public: list all services (legacy) — geo-priced
router.get('/services', async (req, res) => {
  try {
    const geo = geoFrom(req);
    const rows = await prisma.services.findMany({ orderBy: { id: 'asc' } });
    const services = rows.map(s => {
      const gp = geoPrice(s, geo);
      const { country_prices, ...pub } = s; // 🔒 don't expose all-country pricing publicly
      return { ...pub, price: gp.m, price_annual: gp.y ?? s.price_annual, currency: geo.currency, geo_code: geo.code };
    });
    res.json({ services, geo: geo.code, currency: geo.currency });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Public: packages (3 tiers) with their items nested
router.get('/packages', async (req, res) => {
  try {
    const geo = geoFrom(req);
    const packages = await prisma.packages.findMany({ orderBy: { sort_order: 'asc' } });
    const items = await prisma.package_items.findMany({ orderBy: [{ package_id: 'asc' }, { sort_order: 'asc' }] });
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
  try {
    const packages = await prisma.packages.findMany({ orderBy: { sort_order: 'asc' } });
    const items = await prisma.package_items.findMany({ orderBy: [{ package_id: 'asc' }, { sort_order: 'asc' }] });
    const result = packages.map(p => ({
      ...p,
      included: items.filter(i => i.package_id === p.id && i.is_included),
      addons: items.filter(i => i.package_id === p.id && i.is_addon),
      standalone: items.filter(i => i.package_id === p.id && !i.is_included && !i.is_addon),
    }));
    res.json({ packages: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: update a PACKAGE price
router.put('/packages/:id/price', requireAuth, requireSuperAdmin, async (req, res) => {
  const { price_monthly, price_annual, price_annual_regular } = req.body;
  try {
    await prisma.packages.update({
      where: { id: Number(req.params.id) },
      data: {
        price_monthly: price_monthly ?? null,
        price_annual: price_annual ?? null,
        price_annual_regular: price_annual_regular ?? null,
      },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: update a PACKAGE ITEM price
router.put('/package-items/:id/price', requireAuth, requireSuperAdmin, async (req, res) => {
  const { price_monthly, price_annual, price_annual_regular } = req.body;
  try {
    await prisma.package_items.update({
      where: { id: Number(req.params.id) },
      data: {
        price_monthly: price_monthly ?? null,
        price_annual: price_annual ?? null,
        price_annual_regular: price_annual_regular ?? null,
      },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: update a STANDALONE SERVICE price
router.put('/services/:id/price', requireAuth, requireSuperAdmin, async (req, res) => {
  const { price, price_annual, price_annual_regular } = req.body;
  try {
    await prisma.services.update({
      where: { id: Number(req.params.id) },
      data: {
        price: price ?? 0,
        price_annual: price_annual ?? null,
        price_annual_regular: price_annual_regular ?? null,
      },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: update a service's tiers (jsonb array)
router.put('/services/:id/tiers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { tiers } = req.body;
  try {
    await prisma.services.update({
      where: { id: Number(req.params.id) },
      data: { tiers: tiers || [] },              // Json column — no manual stringify
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: set country-specific prices (services or packages)
// body: { type:'service'|'package', country_prices:{ default:14.99, CA:18, 'CA-BC':20 } }
router.put('/country-prices/:type/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { type, id } = req.params;
  const { country_prices } = req.body;
  try {
    // the model is chosen from a fixed pair — never interpolated from user input
    const data = { country_prices: country_prices || {} };
    const where = { id: Number(id) };
    if (type === 'package') await prisma.packages.update({ where, data });
    else await prisma.services.update({ where, data });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🎁 OFFERS
// Public: list active offers
// 🔒 Super admin: list all offers (coupons are internal)
router.get('/offers', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const offers = await prisma.offers.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ offers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Create offer
router.post('/offers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { code, label, percent_off, starts_at, ends_at, applies_to } = req.body;
  if (!code || !percent_off) return res.status(400).json({ error: 'Missing code or percent' });
  try {
    const offer = await prisma.offers.create({
      data: {
        code: code.toUpperCase(),
        label: label || null,
        percent_off,
        starts_at: starts_at ? new Date(starts_at) : null,
        ends_at: ends_at ? new Date(ends_at) : null,
        applies_to: applies_to || 'all',
      },
    });
    res.status(201).json({ offer });
  } catch (e) {
    if (e.code === 'P2002' || e.code === '23505') return res.status(409).json({ error: 'Code already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Public: validate a coupon code (for checkout)
// applies_to: 'all' | 'service:ID' | 'package:ID'
router.get('/offers/validate/:code', async (req, res) => {
  try {
    const today = new Date();
    const offer = await prisma.offers.findFirst({
      where: {
        code: req.params.code.toUpperCase(),
        active: true,
        AND: [
          { OR: [{ starts_at: null }, { starts_at: { lte: today } }] },
          { OR: [{ ends_at: null }, { ends_at: { gte: today } }] },
        ],
      },
    });
    if (!offer) return res.status(404).json({ valid: false, error: 'Invalid or expired code' });
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
  try {
    const id = Number(req.params.id);
    const cur = await prisma.offers.findUnique({ where: { id }, select: { active: true } });
    if (!cur) return res.status(404).json({ error: 'Not found' });
    await prisma.offers.update({ where: { id }, data: { active: !cur.active } });   // active = NOT active
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/offers/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.offers.deleteMany({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const exists = await prisma.users.findFirst({ where: { email: friend_email }, select: { id: true } });
    if (exists) return res.status(409).json({ error: 'That email already has an account' });
    const referral = await prisma.referrals.create({ data: { referrer_email, friend_email } });
    res.status(201).json({ referral });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔒 Super admin: list all referrals
router.get('/referrals', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const referrals = await prisma.referrals.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ referrals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
