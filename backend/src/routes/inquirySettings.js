import express from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const DEFAULTS = {
  brand_name: null, brand_color: '#2dd4bf', intro_text: 'Tell us about your event 💫',
  show_phone: true, show_guests: true, show_times: true, show_location: true,
  show_getting_ready: true, show_notes: true,
  event_types: ['Wedding', 'Engagement', 'Portrait', 'Event', 'Other'],
};

// PUBLIC: GET /api/inquiry-settings/:vendorId → used by the public form
router.get('/:vendorId', async (req, res) => {
  try {
    const { rows: v } = await query('SELECT id, business_name FROM vendors WHERE id=$1', [req.params.vendorId]);
    if (!v[0]) return res.status(404).json({ error: 'Vendor not found' });
    const { rows } = await query('SELECT * FROM inquiry_settings WHERE vendor_id=$1', [req.params.vendorId]);
    const s = rows[0] || DEFAULTS;
    res.json({ settings: { ...DEFAULTS, ...s, brand_name: s.brand_name || v[0].business_name } });
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
        (vendor_id, brand_name, brand_color, intro_text, show_phone, show_guests, show_times,
         show_location, show_getting_ready, show_notes, event_types)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (vendor_id) DO UPDATE SET
        brand_name=$2, brand_color=$3, intro_text=$4, show_phone=$5, show_guests=$6,
        show_times=$7, show_location=$8, show_getting_ready=$9, show_notes=$10,
        event_types=$11, updated_at=NOW()`,
      [v, b.brand_name || null, b.brand_color || '#2dd4bf', b.intro_text || DEFAULTS.intro_text,
       b.show_phone ?? true, b.show_guests ?? true, b.show_times ?? true,
       b.show_location ?? true, b.show_getting_ready ?? true, b.show_notes ?? true,
       JSON.stringify(b.event_types || DEFAULTS.event_types)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
