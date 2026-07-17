// 🗝️ ENTITLEMENTS — single source of truth for feature access.
// features(vendor) = active plan features ∪ enabled standalone services
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { query } from '../config/db.js';
dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** All feature keys a vendor currently has access to.
 *  = (active plan features ∪ enabled standalone services), then per-vendor
 *  overrides are applied last: an override can force a feature ON (add it) or
 *  OFF (remove it) regardless of plan/services — this is the super-admin toggle. */
export async function getFeatures(vendorId) {
  const { rows } = await query(
    `SELECT pf.feature_key FROM vendor_subscriptions vs
       JOIN plan_features pf ON pf.plan_id = vs.plan_id
      WHERE vs.vendor_id = $1 AND vs.status = 'active'
        AND (vs.ends_at IS NULL OR vs.ends_at > NOW())
     UNION
     SELECT s.feature_key FROM vendor_services v
       JOIN services s ON s.id = v.service_id
      WHERE v.vendor_id = $1 AND v.enabled = TRUE AND s.feature_key IS NOT NULL`,
    [vendorId]);
  const set = new Set(rows.map(r => r.feature_key));

  // apply per-vendor overrides last (super-admin manual on/off)
  const { rows: ovr } = await query(
    `SELECT feature_key, enabled FROM vendor_feature_overrides WHERE vendor_id = $1`,
    [vendorId]);
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
