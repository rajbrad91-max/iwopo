/**
 * 📞 The safety net behind the webhook.
 *
 * A webhook is instant and a webhook can be missed — a deploy, a restart, a
 * moment of network trouble, and that event is simply gone. Production systems
 * run both: the webhook for immediacy, a poll for everything it dropped.
 *
 * ⚠️ In Perfect Poses this was a fifteen-minute cron in Hostinger's hPanel,
 * which could not be created over SSH and which nobody can see running. Raj's
 * experience there was that calls "hardly get updated" and he syncs by hand.
 * This runs INSIDE the app on a machine we control, so there is nothing
 * external to forget and no shared-hosting scheduler to quietly stop.
 *
 * Every minute, not every fifteen. It is two small API calls against a window
 * that is almost always empty, and a minute is the difference between a
 * missed webhook being invisible and being noticed.
 */
import prisma from '../config/prisma.js';
import { quoConfig, listCalls, listMessages } from './quo.js';
import { normalise, upsertEvent } from '../routes/commsWebhook.js';

let running = false;

export async function pollComms() {
  /* One at a time. A slow Quo response must not let the next tick start a
     second overlapping sweep. */
  if (running) return { skipped: 'already running' };
  running = true;
  try {
    const cfg = await quoConfig();
    if (!cfg.ready || !cfg.vendorId) return { skipped: 'not configured' };

    /* From the newest thing already held, minus a small overlap. Asking from
       exactly the last timestamp loses anything that landed in the same
       second, and the upsert makes re-seeing an event free. */
    const newest = await prisma.comms_events.findFirst({
      where: { vendor_id: cfg.vendorId },
      orderBy: { occurred_at: 'desc' },
      select: { occurred_at: true },
    });
    const since = newest
      ? new Date(newest.occurred_at.getTime() - 5 * 60_000)
      : new Date(Date.now() - 7 * 864e5);        // first run: a week of history

    let added = 0;
    for (const [fetch_, type] of [[listCalls, 'call'], [listMessages, 'message']]) {
      let rows = [];
      try {
        rows = await fetch_(cfg.key, { phoneNumberId: cfg.phoneNumberId || undefined, since, max: 100 });
      } catch (e) {
        console.error('[comms] poll failed for', type, '—', e.message);
        continue;                                 // one kind failing must not stop the other
      }
      for (const r of rows) {
        const row = normalise(type, r);
        if (row && await upsertEvent(cfg.vendorId, row)) added++;
      }
    }
    return { added };
  } catch (e) {
    console.error('[comms] poll error:', e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}
