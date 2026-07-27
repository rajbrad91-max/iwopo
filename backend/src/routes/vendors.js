import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant.js';
import { getFeatures } from '../lib/entitlements.js';

const router = express.Router();

/**
 * The toggleable features, read from the services table rather than written out
 * here. This list used to be its own copy and had drifted: it offered
 * `bookings`, `packages` and `inqform`, none of which gate anything — those tabs
 * all check `leads` — and it called File Flyer "Storage", which is a third name
 * for the same product. One table now names every service once.
 *
 * Services that aren't built yet come back marked, so the panel can show them
 * without pretending a toggle would do something.
 */
async function featureList() {
  const rows = await prisma.services.findMany({
    where: { feature_key: { not: null } },
    select: { feature_key: true, name: true, icon: true, description: true, is_live: true },
    orderBy: [{ is_live: 'desc' }, { name: 'asc' }],
  });
  return rows.map(r => ({
    key: r.feature_key,
    label: r.name,
    icon: r.icon,
    description: r.description,
    is_live: r.is_live,
  }));
}

// GET /api/vendors  → super admin: list ALL vendors
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const vendors = await prisma.vendors.findMany({ orderBy: { created_at: 'desc' } });
    res.json({ vendors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/vendors/:id/detail → super admin: full vendor profile
router.get('/:id/detail', requireAuth, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const vendor = await prisma.vendors.findUnique({ where: { id } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const users = await prisma.users.findMany({
      where: { vendor_id: id },
      select: { id: true, name: true, email: true, role: true, created_at: true },
    });

    const vsRows = await prisma.vendor_services.findMany({
      where: { vendor_id: id },
      select: { id: true, enabled: true, services: { select: { name: true, icon: true, price: true } } },
    });
    const services = vsRows
      .map(r => ({ id: r.id, enabled: r.enabled, name: r.services?.name, icon: r.services?.icon, price: r.services?.price }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const subRows = await prisma.vendor_subscriptions.findMany({
      where: { vendor_id: id },
      orderBy: { started_at: 'desc' },
      select: { id: true, status: true, started_at: true, ends_at: true, plans: { select: { name: true } } },
    });
    const subscriptions = subRows.map(({ plans, ...s }) => ({ ...s, plan_name: plans?.name ?? null }));

    const emails = users.map(u => u.email).filter(Boolean);
    const referral = emails.length
      ? await prisma.referrals.findMany({
          where: { friend_email: { in: emails } },
          select: { referrer_email: true, status: true, created_at: true },
        })
      : [];

    res.json({ vendor, users, services, subscriptions, referredBy: referral[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/vendors/me/services → a vendor's own services (tenant-scoped)
router.get('/me/services', requireAuth, tenantScope, async (req, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'No tenant' });
  try {
    // LEFT JOIN vendor_services ON service_id AND vendor_id: every service row is
    // returned, with `enabled` coming only from THIS tenant's row (false if none).
    const services = await prisma.services.findMany({ orderBy: { id: 'asc' } });
    const mine = await prisma.vendor_services.findMany({
      where: { vendor_id: req.tenantId },        // 🔒 locked to this tenant
      select: { service_id: true, enabled: true },
    });
    const enabledBy = new Map(mine.map(r => [r.service_id, r.enabled]));
    res.json({ services: services.map(s => ({ ...s, enabled: enabledBy.get(s.id) ?? false })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/vendors/:vendorId/services/:serviceId/toggle → super admin toggles
router.post('/:vendorId/services/:serviceId/toggle',
  requireAuth, requireSuperAdmin, async (req, res) => {
  const vendorId = Number(req.params.vendorId);
  const serviceId = Number(req.params.serviceId);
  const { enabled } = req.body;
  try {
    await prisma.vendor_services.upsert({
      where: { vendor_id_service_id: { vendor_id: vendorId, service_id: serviceId } },
      update: { enabled },
      create: { vendor_id: vendorId, service_id: serviceId, enabled },
    });
    res.json({ ok: true, vendorId, serviceId, enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/vendors/:id/features → super admin: every toggleable feature + whether
// this vendor currently has it (after plan + services + overrides), and whether an
// explicit override exists.
router.get('/:id/features', requireAuth, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const active = await getFeatures(id); // effective set (plan ∪ services, overrides applied)
    const ovr = await prisma.vendor_feature_overrides.findMany({
      where: { vendor_id: id },
      select: { feature_key: true, enabled: true },
    });
    const overrideMap = Object.fromEntries(ovr.map(o => [o.feature_key, o.enabled]));
    const list = await featureList();
    const features = list.map(f => ({
      key: f.key,
      label: f.label,
      icon: f.icon,
      description: f.description,
      is_live: f.is_live,          // false = nothing built behind it yet
      enabled: active.has(f.key),
      overridden: f.key in overrideMap,
    }));
    res.json({ features });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/vendors/:id/features/:key → super admin: force a feature ON or OFF for
// this vendor. Body { enabled: true|false } sets an override; { clear: true }
// removes the override so the feature falls back to plan/services default.
router.put('/:id/features/:key', requireAuth, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { key } = req.params;
  const { enabled, clear } = req.body;
  const list = await featureList();
  const feat = list.find(f => f.key === key);
  if (!feat) return res.status(400).json({ error: 'Unknown feature' });
  // Refuse to switch on something that doesn't exist yet. Turning it on would
  // record an entitlement for a product with no page behind it, and the vendor
  // would see nothing — which is exactly what happened with Website Builder.
  if (!feat.is_live && enabled) {
    return res.status(409).json({
      error: 'not_built',
      feature: key,
      message: `${feat.label} isn't built yet, so switching it on wouldn't give the vendor anything.`,
    });
  }
  try {
    if (clear) {
      await prisma.vendor_feature_overrides.deleteMany({ where: { vendor_id: id, feature_key: key } });
    } else {
      await prisma.vendor_feature_overrides.upsert({
        where: { vendor_id_feature_key: { vendor_id: id, feature_key: key } },
        update: { enabled: !!enabled, updated_at: new Date() },
        create: { vendor_id: id, feature_key: key, enabled: !!enabled, updated_at: new Date() },
      });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
