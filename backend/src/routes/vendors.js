import express from 'express';
import { query } from '../config/db.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant.js';

const router = express.Router();

// GET /api/vendors  → super admin: list ALL vendors
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM vendors ORDER BY created_at DESC');
  res.json({ vendors: rows });
});

// GET /api/vendors/:id/detail → super admin: full vendor profile
router.get('/:id/detail', requireAuth, requireSuperAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const { rows: v } = await query('SELECT * FROM vendors WHERE id=$1', [id]);
    if (!v[0]) return res.status(404).json({ error: 'Vendor not found' });

    const { rows: users } = await query('SELECT id,name,email,role,created_at FROM users WHERE vendor_id=$1', [id]);
    const { rows: services } = await query(
      `SELECT vs.id, vs.enabled, s.name, s.icon, s.price
       FROM vendor_services vs JOIN services s ON s.id=vs.service_id
       WHERE vs.vendor_id=$1 ORDER BY s.name`, [id]);
    const { rows: subs } = await query(
      `SELECT vsub.id, vsub.status, vsub.started_at, vsub.ends_at, p.name AS plan_name
       FROM vendor_subscriptions vsub LEFT JOIN plans p ON p.id=vsub.plan_id
       WHERE vsub.vendor_id=$1 ORDER BY vsub.started_at DESC`, [id]);
    const emails = users.map(u => u.email);
    const { rows: referral } = emails.length
      ? await query('SELECT referrer_email, status, created_at FROM referrals WHERE friend_email = ANY($1)', [emails])
      : { rows: [] };

    res.json({ vendor: v[0], users, services, subscriptions: subs, referredBy: referral[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/vendors/me/services → a vendor's own services (tenant-scoped)
router.get('/me/services', requireAuth, tenantScope, async (req, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'No tenant' });
  const { rows } = await query(
    `SELECT s.*, COALESCE(vs.enabled,false) AS enabled
     FROM services s
     LEFT JOIN vendor_services vs
       ON vs.service_id = s.id AND vs.vendor_id = $1
     ORDER BY s.id`,
    [req.tenantId]  // 🔒 locked to this tenant
  );
  res.json({ services: rows });
});

// POST /api/vendors/:vendorId/services/:serviceId/toggle → super admin toggles
router.post('/:vendorId/services/:serviceId/toggle',
  requireAuth, requireSuperAdmin, async (req, res) => {
  const { vendorId, serviceId } = req.params;
  const { enabled } = req.body;

  await query(
    `INSERT INTO vendor_services (vendor_id, service_id, enabled)
     VALUES ($1,$2,$3)
     ON CONFLICT (vendor_id, service_id) DO UPDATE SET enabled=$3`,
    [vendorId, serviceId, enabled]
  );
  res.json({ ok: true, vendorId, serviceId, enabled });
});

export default router;
