// 🗝️ ENTITLEMENTS — single source of truth for feature access.
// features(vendor) = active plan features ∪ enabled standalone services
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import prisma from '../config/prisma.js';
import { tokenStillValid } from './tokenRevocation.js';
dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** All feature keys a vendor currently has access to.
 *  = (active plan features ∪ enabled standalone services), then per-vendor
 *  overrides are applied last: an override can force a feature ON (add it) or
 *  OFF (remove it) regardless of plan/services — this is the super-admin toggle. */
export async function getFeatures(vendorId) {
  const vid = Number(vendorId);
  const now = new Date();

  // side A of the old UNION: features granted by an ACTIVE, unexpired plan
  const subs = await prisma.vendor_subscriptions.findMany({
    where: {
      vendor_id: vid,                                     // 🔒 tenancy
      status: 'active',
      OR: [{ ends_at: null }, { ends_at: { gt: now } }],
    },
    select: { plans: { select: { plan_features: { select: { feature_key: true } } } } },
  });

  // side B: features granted by an enabled standalone service
  const svcs = await prisma.vendor_services.findMany({
    where: {
      vendor_id: vid,                                     // 🔒 tenancy
      enabled: true,
      services: { feature_key: { not: null } },
    },
    select: { services: { select: { feature_key: true } } },
  });

  const set = new Set();                                  // UNION de-duplicates
  for (const s of subs) for (const pf of (s.plans?.plan_features || [])) set.add(pf.feature_key);
  for (const v of svcs) if (v.services?.feature_key) set.add(v.services.feature_key);

  // apply per-vendor overrides last (super-admin manual on/off)
  const ovr = await prisma.vendor_feature_overrides.findMany({
    where: { vendor_id: vid },                            // 🔒 tenancy
    select: { feature_key: true, enabled: true },
  });
  for (const o of ovr) {
    if (o.enabled) set.add(o.feature_key);
    else set.delete(o.feature_key);
  }
  return set;
}

/** Decode Bearer token if present (does NOT reject — public routes pass through). */
function tryUser(req) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.split(' ')[1], SECRET); } catch { return null; }
}

/**
 * Mount-level feature gate.
 * - Public (no token) requests pass through → route's own token security applies.
 * - super_admin always passes.
 * - Vendors must have the feature, else 402 with a friendly upsell payload.
 */
export function gate(featureKey) {
  return async (req, res, next) => {
    const user = tryUser(req);
    if (!user) return next();                    // public route (signing links etc.)
    /* 🎟️ A cancelled token must not buy feature access either. Treated as
       anonymous rather than refused — this gate also fronts public routes, and
       requireAuth is what turns a dead token into a 401. */
    if (!await tokenStillValid(user)) return next();
    if (user.role === 'super_admin') return next();
    if (!user.vendor_id) return next();
    try {
      const features = await getFeatures(user.vendor_id);
      if (features.has(featureKey)) return next();
      return res.status(402).json({
        error: 'feature_locked',
        feature: featureKey,
        message: 'This feature is not part of your current plan. Upgrade or add it in My Services. ✨',
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}
