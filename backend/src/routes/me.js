import { LOGO_DIR as LOGO_DIR_CFG } from '../config/paths.js';
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
      select: { id: true, business_name: true, phone: true, email: true, country: true, logo_path: true },
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
    await sharp(req.file.path).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(path.join(LOGO_DIR, fname));
    fs.unlinkSync(req.file.path);
    await prisma.vendors.update({ where: { id: vid }, data: { logo_path: fname } }); // 🔒 tenancy
    res.json({ ok: true, logo_path: fname });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/me/logo/:file → serve a logo (public)
router.get('/logo/:file', (req, res) => {
  const f = path.join(LOGO_DIR, path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f);
});

export default router;
