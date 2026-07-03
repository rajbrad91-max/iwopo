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
