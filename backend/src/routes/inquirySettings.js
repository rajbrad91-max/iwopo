import express from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const DEFAULTS = {
  brand_name: null, brand_color: '#2dd4bf', intro_text: 'Tell us about your event', intro_link: '',
  theme: 'classic', font: 'Inter', details_heading: 'Event Details',
  custom_fields: [], background: 'none', logo_path: '',
};

// PUBLIC: GET /api/inquiry-settings/:vendorId → used by the public form
router.get('/:vendorId', async (req, res) => {
  try {
    const { rows: v } = await query('SELECT id, business_name, logo_path FROM vendors WHERE id=$1', [req.params.vendorId]);
    if (!v[0]) return res.status(404).json({ error: 'Vendor not found' });
    const { rows } = await query('SELECT * FROM inquiry_settings WHERE vendor_id=$1', [req.params.vendorId]);
    const s = rows[0] || DEFAULTS;
    res.json({ settings: { ...DEFAULTS, ...s, brand_name: s.brand_name || v[0].business_name, logo_path: v[0].logo_path || '' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// VENDOR: PUT /api/inquiry-settings → save my form settings
router.put('/', requireAuth, async (req, res) => {
  const v = req.user.role === 'super_admin' ? req.body.vendor_id : req.user.vendor_id;
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const b = req.body;
  try {
    await query(
      `INSERT INTO inquiry_settings
        (vendor_id, brand_name, brand_color, intro_text, intro_link,
         theme, font, details_heading, custom_fields, background)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (vendor_id) DO UPDATE SET
        brand_name=$2, brand_color=$3, intro_text=$4, intro_link=$5,
        theme=$6, font=$7, details_heading=$8, custom_fields=$9,
        background=$10, updated_at=NOW()`,
      [v, b.brand_name || null, b.brand_color || '#2dd4bf', b.intro_text || DEFAULTS.intro_text,
       b.intro_link || '', b.theme || 'classic', b.font || 'Inter',
       b.details_heading || 'Event Details',
       JSON.stringify(b.custom_fields || []), b.background || 'none']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
