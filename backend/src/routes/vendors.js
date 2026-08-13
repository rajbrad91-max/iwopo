import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant.js';
import { getFeatures } from '../lib/entitlements.js';
import { storageFor } from '../lib/storageQuota.js';

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
    /* Storage per buyer, from the same meter the uploads use. Done in one pass
       rather than a request per row — the list is the place a super admin
       notices someone is full, and a number that needs a click is a number
       nobody looks at. */
    const withStorage = await Promise.all(vendors.map(async (v) => {
      try {
        const st = await storageFor(v.id);
        return { ...v, storage: { used_bytes: st.used_bytes, limit_mb: st.limit_mb, percent: st.percent, limit_source: st.limit_source } };
      } catch { return { ...v, storage: null }; }
    }));
    res.json({ vendors: withStorage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 💾 PUT /api/vendors/:id/storage → set one vendor's storage allowance.
 *
 * Super-admin only, and deliberately per-vendor rather than a plan feature:
 * the allowance is a commercial decision made about a particular vendor, and
 * tying it to a plan would mean changing everyone on that plan to change one.
 */
router.put('/:id/storage', requireAuth, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    /* null clears the override and hands the vendor back to their package.
       Without this a limit set once could never be undone — only replaced by
       another guess at what the package gives. */
    const raw = req.body?.storage_limit_mb;
    if (raw === null || raw === '') {
      const vendor0 = await prisma.vendors.findUnique({ where: { id }, select: { id: true } });
      if (!vendor0) return res.status(404).json({ error: 'Vendor not found' });
      await prisma.vendor_settings.updateMany({ where: { vendor_id: id }, data: { storage_limit_mb: null } });
      return res.json({ ok: true, storage_limit_mb: null, cleared: true });
    }
    const mb = Number(raw);
    if (!Number.isFinite(mb) || mb < 0) return res.status(400).json({ error: 'Give a number of MB' });
    const vendor = await prisma.vendors.findUnique({ where: { id }, select: { id: true } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    await prisma.vendor_settings.upsert({
      where: { vendor_id: id },
      update: { storage_limit_mb: Math.round(mb) },
      create: { vendor_id: id, storage_limit_mb: Math.round(mb) },
    });
    res.json({ ok: true, storage_limit_mb: Math.round(mb) });
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

    /**
     * 💾 What this vendor has stored, against their allowance. Summed from the
     * rows rather than a counter — a counter and the real files drift apart the
     * moment anything fails halfway, and then the number a vendor is judged by
     * is quietly wrong.
     */
    /* One meter, not a second opinion. This used to add up File Flyer alone —
       so a vendor with forty gigabytes of galleries read as empty — and fall
       back to 1024MB when there was no override, which showed a two hundred
       gigabyte vendor as having one. storageFor() is what the upload path
       enforces, so it is the only number that can be right. */
    const st = await storageFor(id);
    const vset = await prisma.vendor_settings.findUnique({
      where: { vendor_id: id }, select: { storage_limit_mb: true },
    });
    const storage = {
      used_bytes: st.used_bytes,
      used_photos_bytes: st.used_photos_bytes,
      used_files_bytes: st.used_files_bytes,
      limit_mb: st.limit_mb,
      limit_source: st.limit_source,          // trial | package | override | fallback
      plan_name: st.plan_name,
      override_mb: vset?.storage_limit_mb ?? null,   // what the box should show as set
    };

    const emails = users.map(u => u.email).filter(Boolean);
    const referral = emails.length
      ? await prisma.referrals.findMany({
          where: { friend_email: { in: emails } },
          select: { referrer_email: true, status: true, created_at: true },
        })
      : [];

    res.json({ vendor, users, services, subscriptions, storage, referredBy: referral[0] || null });
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
