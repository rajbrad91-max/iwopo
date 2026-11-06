import prisma from '../config/prisma.js';
import { stripe, stripeReady } from './stripe.js';

/**
 * 🎟️ A Super Admin coupon, mirrored in Stripe (Muse F-05: codes were made in iwopo but never in Stripe, so checkout —
 * which takes Stripe promotion codes — refused every one). Each offer becomes a Stripe coupon (percent off the first
 * payment) and a promotion code with the same CODE, active only while the offer is. Called when an offer is made,
 * switched on or off, or deleted; safe to call again — it creates what is missing and updates what exists.
 */
export async function syncOffer(offer, { removing = false } = {}) {
  if (!stripeReady() || !offer) return { synced: false };
  let { stripe_coupon_id: couponId, stripe_promo_id: promoId } = offer;
  const today = new Date();
  const live = !removing && offer.active && (!offer.starts_at || new Date(offer.starts_at) <= today)
    && (!offer.ends_at || new Date(offer.ends_at) >= today);
  if (!couponId && !removing) {
    const coupon = await stripe('POST', '/coupons', {
      percent_off: Number(offer.percent_off), duration: 'once', name: offer.label || offer.code,
      metadata: { offer_id: offer.id },
    }, { idempotencyKey: `coupon-offer-${offer.id}` });
    couponId = coupon.id;
  }
  if (couponId && !promoId && !removing) {
    const ends = offer.ends_at ? Math.floor(new Date(offer.ends_at).setUTCHours(23, 59, 59, 0) / 1000) : undefined;
    const promo = await stripe('POST', '/promotion_codes', {
      coupon: couponId, code: offer.code, active: live, ...(ends && ends > Date.now() / 1000 ? { expires_at: ends } : {}),
      metadata: { offer_id: offer.id },
    }, { idempotencyKey: `promo-offer-${offer.id}` });
    promoId = promo.id;
  } else if (promoId) {
    await stripe('POST', `/promotion_codes/${promoId}`, { active: live });
  }
  if (removing) return { synced: true };
  if (couponId !== offer.stripe_coupon_id || promoId !== offer.stripe_promo_id) {
    await prisma.offers.update({ where: { id: offer.id }, data: { stripe_coupon_id: couponId, stripe_promo_id: promoId } });
  }
  return { synced: true, live };
}
