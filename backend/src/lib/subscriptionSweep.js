/**
 * 🎫 Close subscriptions whose end date has passed.
 *
 * Nothing did. The quota and the feature gate both check ends_at when they
 * read, so an expired subscription correctly stops granting anything — the
 * vendor is not over-served. What was wrong is the RECORD: the row stayed
 * 'active' for ever, so the Buyers list counted a lapsed customer as paying and
 * their subscription history showed no end.
 *
 * That is a reporting problem rather than a security one, which is why it went
 * unnoticed: every number a vendor sees was already right, and only the numbers
 * Raj sees were wrong.
 *
 * ⚠️ This closes rows that have already expired. It does not decide WHEN a
 * subscription should end — nothing bills yet, so ends_at is set by hand or not
 * at all.
 */
import prisma from '../config/prisma.js';

export async function sweepExpiredSubscriptions() {
  try {
    const { count } = await prisma.vendor_subscriptions.updateMany({
      where: { status: 'active', ends_at: { not: null, lt: new Date() } },
      data: { status: 'ended' },
    });
    if (count) console.log('[subscriptions] closed', count, 'that had expired');
    return count;
  } catch (e) {
    console.error('[subscriptions] sweep failed:', e.message);
    return 0;
  }
}
