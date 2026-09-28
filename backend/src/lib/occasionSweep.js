/**
 * 🎉 The nightly reminder.
 *
 * Raj's actual ask: not to forget. Everything else on the occasions page is
 * convenience — this is the feature. Without it he has to remember to look,
 * which is the thing he said he cannot do.
 *
 * Uses the same upcomingFor() as the page. Two implementations of "whose
 * anniversary is it" would eventually disagree, and the one that disagreed
 * silently would be this one.
 */
import prisma from '../config/prisma.js';
import { upcomingFor, NOTIFY_DAYS } from '../routes/occasions.js';
import { notify } from '../routes/notifications.js';

export async function sweepOccasions() {
  try {
    const vendors = await prisma.vendors.findMany({ select: { id: true } });
    let raised = 0;

    for (const v of vendors) {
      let due;
      try { due = await upcomingFor(v.id, NOTIFY_DAYS); }
      catch { continue; }                    // one vendor's bad data must not stop the rest

      /* Already wished, or already told about today — neither needs a bell. */
      const worth = due.filter(o => !o.sent_at);
      if (!worth.length) continue;

      for (const o of worth) {
        const when = o.days_away === 0 ? 'today'
          : o.days_away === 1 ? 'tomorrow'
          : `in ${o.days_away} days`;

        const title = o.kind === 'birthday'
          ? `🎂 ${o.name || 'A client'}'s birthday is ${when}`
          : `🎉 ${o.name || 'A client'}'s ${o.years ? `${o.years}-year ` : ''}anniversary is ${when}`;

        /* The notification itself is the reminder, and it is raised once a day
           while the occasion is close. A duplicate is noise; missing it is the
           whole failure being prevented. Guarded by the date in the body so
           the same day never raises twice. */
        const stamp = new Date(o.occasion_on).toISOString().slice(0, 10);
        const already = await prisma.notifications.findFirst({
          where: {
            vendor_id: v.id, type: 'occasion', link_id: o.lead_id,
            body: { contains: stamp },
            created_at: { gte: new Date(Date.now() - 20 * 3600_000) },
          },
          select: { id: true },
        });
        if (already) continue;

        await notify(v.id, title, `${stamp} · open Occasions to send their wishes`,
          'occasion', { type: 'occasion', id: o.lead_id });
        raised++;
      }
    }
    if (raised) console.log('[occasions] raised', raised, 'reminder(s)');
    return raised;
  } catch (e) {
    console.error('[occasions] sweep failed:', e.message);
    return 0;
  }
}
