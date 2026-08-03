import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const DEFAULTS = {
  brand_name: null, brand_color: '#2dd4bf', intro_text: 'Tell us about your event', intro_link: '',
  theme: 'classic', font: 'Inter', details_heading: 'Event Details',
  custom_fields: [], background: 'none',
};

// VENDOR: GET /api/inquiry-settings/my → my own settings, from the token.
// Declared BEFORE the :handle route: 'my' is a valid-looking slug, so a param
// route registered first would swallow it and answer 404.
router.get('/my', requireAuth, async (req, res) => {
  const vid = req.user.role === 'super_admin'
    ? Number(req.query.vendor_id) || null       // 🔒 only a super admin may name one
    : req.user.vendor_id;                       //    everyone else: from the token
  if (!vid) return res.status(400).json({ error: 'No vendor' });
  try {
    const vendor = await prisma.vendors.findUnique({
      where: { id: vid },                              // 🔒 tenancy — own row only
      select: { business_name: true, logo_path: true, slug: true },
    });
    const s = await prisma.inquiry_settings.findUnique({ where: { vendor_id: vid } }) || DEFAULTS;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      settings: { ...DEFAULTS, ...s, brand_name: s.brand_name || vendor?.business_name, logo_path: vendor?.logo_path || '' },
      slug: vendor?.slug || '',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: GET /api/inquiry-settings/:handle → used by the public form.
// The handle is the vendor's slug. Numeric ids are deliberately NOT accepted:
// /inquiry/1 was guessable and countable, and those links are retired.
router.get('/:handle', async (req, res) => {
  try {
    const handle = String(req.params.handle || '').toLowerCase();
    // A bad link is a 404, not a 500 — "our server broke" is the wrong answer to
    // a typo. A retired numeric link gets the same 404, so it can't be told
    // apart from a slug that was never in use.
    if (!/^[a-z0-9-]{1,80}$/.test(handle) || /^\d+$/.test(handle)) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const vendor = await prisma.vendors.findUnique({
      where: { slug: handle },
      select: { id: true, business_name: true, logo_path: true },
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const vendorId = vendor.id;
    const s = await prisma.inquiry_settings.findUnique({ where: { vendor_id: vendorId } }) || DEFAULTS;

    // 🚫 never cache this. Express adds an ETag, and with no Cache-Control the
    // browser applies heuristic caching — it revalidates, gets a 304, and keeps
    // showing the OLD settings. A vendor would save a change, see the database
    // update, and the public form would still render the previous version.
    // app.set('etag', false) in server.js stops the ETag being generated at all,
    // so a conditional request can't come back 304 either.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    // the assistant's name lives with its knowledge, not with the form settings
    const kb = await prisma.chatbot_knowledge.findUnique({
      where: { vendor_id: vendorId }, select: { bot_name: true },
    });

    res.json({ settings: { ...DEFAULTS, ...s, brand_name: s.brand_name || vendor.business_name, logo_path: vendor.logo_path || '', bot_name: (kb?.bot_name || '').trim() || 'Wopo Assistant' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VENDOR: PUT /api/inquiry-settings → save my form settings
router.put('/', requireAuth, async (req, res) => {
  const v = req.user.role === 'super_admin' ? Number(req.body.vendor_id) : req.user.vendor_id;
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const b = req.body;
  try {
    const data = {
      brand_name: b.brand_name || null,
      brand_color: b.brand_color || '#2dd4bf',
      intro_text: b.intro_text || DEFAULTS.intro_text,
      intro_link: b.intro_link || '',
      theme: b.theme || 'classic',
      font: b.font || 'Inter',
      details_heading: b.details_heading || 'Event Details',
      custom_fields: b.custom_fields || [],   // Json column — Prisma serializes it
      background: b.background || 'none',
      updated_at: new Date(),
    };
    await prisma.inquiry_settings.upsert({
      where: { vendor_id: v },                // 🔒 tenancy
      update: data,
      create: { vendor_id: v, ...data },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
