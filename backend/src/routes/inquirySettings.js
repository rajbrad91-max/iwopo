import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const DEFAULTS = {
  brand_name: null, brand_color: '#2dd4bf', intro_text: 'Tell us about your event', intro_link: '',
  theme: 'classic', font: 'Inter', details_heading: 'Event Details',
  custom_fields: [], background: 'none',
};

// PUBLIC: GET /api/inquiry-settings/:vendorId → used by the public form
router.get('/:vendorId', async (req, res) => {
  try {
    const vendorId = Number(req.params.vendorId);
    const vendor = await prisma.vendors.findUnique({
      where: { id: vendorId },
      select: { id: true, business_name: true, logo_path: true },
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
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

    res.json({ settings: { ...DEFAULTS, ...s, brand_name: s.brand_name || vendor.business_name, logo_path: vendor.logo_path || '' } });
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
