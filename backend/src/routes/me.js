import { LOGO_DIR as LOGO_DIR_CFG } from '../config/paths.js';
import * as objects from '../lib/objectStore.js';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getFeatures } from '../lib/entitlements.js';
import { CURRENCIES, CURRENCY_CODES, currencyFor } from '../lib/currencies.js';
import { storageFor } from '../lib/storageQuota.js';

const router = express.Router();
const LOGO_DIR = LOGO_DIR_CFG;
const upload = multer({ dest: '/tmp/vf_uploads', limits: { fileSize: 8 * 1024 * 1024 } });

// GET /api/me/features → feature keys this vendor has (super_admin gets '*')
router.get('/features', requireAuth, async (req, res) => {
  if (req.user.role === 'super_admin') return res.json({ features: ['*'] });
  if (!req.user.vendor_id) return res.json({ features: [] });
  try {
    const set = await getFeatures(req.user.vendor_id);
    res.json({ features: [...set] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/me/currencies → the list the preferences dropdown offers.
// Served from the backend so the country-to-currency map lives in exactly one
// place; the panel needs the choices, not a second copy of the rules.
/**
 * 💾 GET /api/me/storage → this vendor's own usage, and where to go next.
 *
 * Same meter the upload path enforces, so the bar a vendor watches and the
 * refusal they eventually hit come from one number. Also names the next package
 * up — a bar filling with no way forward is a complaint, not a feature.
 */
router.get('/storage', requireAuth, async (req, res) => {
  const v = req.user.vendor_id;                       // 🔒 from the token, never the request
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    const st = await storageFor(v);
    /* The next package that actually offers MORE room than this vendor has.
       Sorted by storage rather than price, because "upgrade" here means space —
       and a cheaper package with more of it would still be the right answer. */
    const bigger = await prisma.packages.findMany({
      where: { storage_gb: { gt: Math.ceil(st.limit_mb / 1024) } },
      orderBy: [{ storage_gb: 'asc' }],
      select: { key: true, name: true, price_monthly: true, storage_gb: true },
    });
    res.json({ ...st, next_package: bigger[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/currencies', requireAuth, (req, res) => {
  res.json({ currencies: CURRENCIES });
});

// GET /api/me/settings
router.get('/settings', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  if (!vid) return res.json({ settings: null });
  try {
    // create the row on first read, same as before
    let settings = await prisma.vendor_settings.findUnique({ where: { vendor_id: vid } }); // 🔒 tenancy
    if (!settings) settings = await prisma.vendor_settings.create({ data: { vendor_id: vid } });

    // 💱 A stored currency is the vendor's own choice; a null one means they
    // haven't chosen, so it follows the country on their profile. Resolving it
    // here rather than in the panel means every screen and every client-facing
    // page agrees on one answer instead of each guessing.
    const vendor = await prisma.vendors.findUnique({
      where: { id: vid }, select: { country: true },
    });
    res.json({
      settings: { ...settings, currency: currencyFor(settings.currency, vendor?.country) },
      chosen_currency: settings.currency,     // null = following the country
      country: vendor?.country || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/me/settings
router.put('/settings', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  if (!vid) return res.status(400).json({ error: 'No vendor' });
  const { time_format, timezone, theme, currency, auto_release_contract } = req.body;
  try {
    const data = {
      time_format: time_format || '12h',
      timezone: timezone || 'America/Vancouver',
      theme: theme || 'dark',
    };
    // only write a currency we actually support; an empty string means "go back
    // to following my country" rather than "store a blank"
    if (currency !== undefined) {
      data.currency = currency && CURRENCY_CODES.has(currency) ? currency : null;
    }
    // 🔓 skip the contract review step for every future contract
    if (auto_release_contract !== undefined) {
      data.auto_release_contract = !!auto_release_contract;
    }
    await prisma.vendor_settings.upsert({
      where: { vendor_id: vid },                  // 🔒 tenancy
      update: { ...data, updated_at: new Date() },
      create: { vendor_id: vid, ...data },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/me/email
router.put('/email', requireAuth, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email + current password required' });
  try {
    const me = await prisma.users.findUnique({ where: { id: req.user.id } });   // 🔒 own account only
    const ok = await bcrypt.compare(password, me.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong password' });
    const dupe = await prisma.users.findFirst({
      where: { email, id: { not: req.user.id } },
      select: { id: true },
    });
    if (dupe) return res.status(409).json({ error: 'Email already in use' });
    await prisma.users.update({ where: { id: req.user.id }, data: { email } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * PUT /api/me/account → the signed-in person's own display name.
 *
 * /me/profile cannot do this. It writes to the vendors table and returns 400
 * without a vendor_id, so a super admin — who has no vendor — had no way to
 * change their own name at all. This writes to users, which is where a name
 * actually lives, and it only ever touches the row the token belongs to.
 */
router.put('/account', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (name.length > 80) return res.status(400).json({ error: 'Name too long (max 80)' });
  try {
    await prisma.users.update({ where: { id: req.user.id }, data: { name } });  // 🔒 own account only
    res.json({ ok: true, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/me/password
router.put('/password', requireAuth, async (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ error: 'Both passwords required' });
  if (next.length < 6) return res.status(400).json({ error: 'New password too short (min 6)' });
  try {
    const me = await prisma.users.findUnique({ where: { id: req.user.id } });   // 🔒 own account only
    const ok = await bcrypt.compare(current, me.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong current password' });
    const hash = await bcrypt.hash(next, 10);
    await prisma.users.update({ where: { id: req.user.id }, data: { password_hash: hash } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/me/profile → vendor business info
router.get('/profile', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  if (!vid) return res.json({ profile: null });
  try {
    const profile = await prisma.vendors.findUnique({
      where: { id: vid },                         // 🔒 tenancy — own vendor row
      select: { id: true, business_name: true, phone: true, email: true, country: true, logo_path: true, slug: true },
    });
    res.json({ profile: profile || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/me/profile → update business info
router.put('/profile', requireAuth, async (req, res) => {
  const vid = req.user.vendor_id;
  if (!vid) return res.status(400).json({ error: 'No vendor' });
  const { business_name, phone, email, country } = req.body;
  try {
    const data = { phone: phone || '', email: email || '', country: country || '' };
    if (business_name) data.business_name = business_name;   // COALESCE($1,business_name)
    await prisma.vendors.update({ where: { id: vid }, data }); // 🔒 tenancy
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/me/logo → upload company logo (single source, used everywhere)
router.post('/logo', requireAuth, upload.single('logo'), async (req, res) => {
  const vid = req.user.vendor_id;
  if (!vid) return res.status(400).json({ error: 'No vendor' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const fname = `${vid}_${Date.now()}.webp`;
    const local = path.join(LOGO_DIR, fname);
    await sharp(req.file.path).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(local);
    fs.unlinkSync(req.file.path);

    /* ☁️ And to R2 when configured. The local copy stays: the reader prefers
       the object and falls back to disk, so an unreachable R2 costs a slower
       read rather than a vendor's logo vanishing from their own website.
       🔒 The key carries the vendor id from the token. */
    if (await objects.enabled(objects.PUBLIC)) {
      try {
        await objects.putObject(objects.PUBLIC, objects.keyFor(vid, 'logos', fname),
          fs.createReadStream(local), 'image/webp');
      } catch (e) { console.error('[logo] R2 upload failed for', fname, e.message); }
    }
    await prisma.vendors.update({ where: { id: vid }, data: { logo_path: fname } }); // 🔒 tenancy
    res.json({ ok: true, logo_path: fname });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/me/logo/:file → a vendor's logo. Public: it appears on their own
 * website and on the inquiry form, both open to the world.
 *
 * Logos live in one flat folder with the vendor id at the front of the name,
 * so the R2 key is derived from that name rather than from a path segment. The
 * shape is checked first — anything that is not <digits>_<digits>.webp is
 * refused outright, so a crafted name cannot be turned into a key at all.
 */
router.get('/logo/:file', async (req, res) => {
  const name = path.basename(req.params.file);
  const m = name.match(/^(\d+)_\d+\.webp$/);

  if (m && await objects.enabled(objects.PUBLIC)) {
    try {
      const o = await objects.getStream(objects.PUBLIC, objects.keyFor(Number(m[1]), 'logos', name));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (o.contentType) res.setHeader('Content-Type', o.contentType);
      if (o.size) res.setHeader('Content-Length', o.size);
      return o.stream.pipe(res);                    // streamed, never buffered
    } catch { /* not migrated yet — fall through to the disk */ }
  }

  const f = path.join(LOGO_DIR, name);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

export default router;
