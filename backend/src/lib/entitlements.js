// 🗝️ ENTITLEMENTS — single source of truth for feature access.
// features(vendor) = active plan features ∪ enabled standalone services
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import prisma from '../config/prisma.js';
import { tokenStillValid } from './tokenRevocation.js';
import { currentPlan } from './billing.js';
import { serverError } from './httpError.js';
dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** All feature keys a vendor currently has access to.
 *  = (active plan features ∪ enabled standalone services), then per-vendor
 *  overrides are applied last: an override can force a feature ON (add it) or
 *  OFF (remove it) regardless of plan/services — this is the super-admin toggle. */
export async function getFeatures(vendorId) {
  const vid = Number(vendorId);

  /* 📋 What the plan in effect unlocks (lib/billing.js currentPlan — owner / paying: their plan · trial: Pro · trial
     over and unpaid: Free, so a vendor keeps taking enquiries rather than losing the panel), plus a standalone service
     they pay for while their account is in good standing, then Super Admin's own on/off last. */
  const { plan, access } = await currentPlan(vid);
  const set = new Set((plan?.plan_features || []).map(f => f.feature_key));
  if (access.allowed) {
    const svcs = await prisma.vendor_services.findMany({
      where: {
        vendor_id: vid,                                   // 🔒 tenancy
        enabled: true,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],                // ➕ a removed add-on until its paid period ends
        services: { feature_key: { not: null } },
      },
      select: { services: { select: { feature_key: true } } },
    });
    for (const v of svcs) if (v.services?.feature_key) set.add(v.services.feature_key);
  }

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
/**
 * 🧹 Clean-up mode (Raj, 2026-11-06): a vendor whose plan no longer includes Galleries or File Flyer — after moving to a
 * smaller plan — but who still has galleries or files there can VIEW, DOWNLOAD and DELETE them (nothing new), so they can
 * get under their storage within the 15 days (lib/overLimit.js) instead of being locked out of their own data.
 */
const CLEANUP = {
  galleries: (vid) => prisma.albums.count({ where: { vendor_id: vid } }),                  // 🔒 this vendor
  fileflyer: (vid) => prisma.file_share_items.count({ where: { vendor_id: vid } }),       // 🔒 this vendor
};
export async function cleanupFeatures(vendorId, features) {
  const out = [];
  for (const [key, count] of Object.entries(CLEANUP)) if (!features.has(key) && await count(Number(vendorId)) > 0) out.push(key);
  return out;
}
// what clean-up may do: look, download, delete — never make or upload
const cleanupAllows = (req) => req.method === 'GET' || req.method === 'DELETE' || (req.method === 'POST' && /delete/i.test(req.path));

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
      if (CLEANUP[featureKey] && cleanupAllows(req) && (await cleanupFeatures(user.vendor_id, features)).includes(featureKey)) return next();
      if (CLEANUP[featureKey] && (await cleanupFeatures(user.vendor_id, features)).includes(featureKey)) {
        return res.status(402).json({ error: 'feature_cleanup', feature: featureKey,
          message: 'This isn\u2019t in your plan any more — you can still view, download and delete what is here. Choose a plan that includes it to add more.' });
      }
      return res.status(402).json({
        error: 'feature_locked',
        feature: featureKey,
        message: 'This feature is not part of your current plan. Upgrade or add it in My Services. ✨',
      });
    } catch (e) { return serverError(res, e); }
  };
}
