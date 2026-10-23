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
 * Every minute, not every fifteen. Normally that is one small request per
 * number — "which conversations moved since last time?" — which is almost
 * always none; only a conversation that moved costs two more.
 */
import privateDb from '../config/privateDb.js';
import { quoConfig, quoConfigs, listPhoneNumbers, listConversations, listCalls, listMessages, ownNumbers } from './quo.js';
import { normalise, upsertEvent } from '../routes/commsWebhook.js';
import { enrichPending, fillContactNames } from './commsEnrich.js';
import { announce } from './commsNotify.js';
import { processLeadRequests } from './callLeads.js';

let running = false;

/**
 * Every vendor with Quo connected (each with their own key and lines), or only `onlyVendor` for "Sync now".
 * One sweep at a time: a slow Quo response must not let the next tick start a second overlapping sweep.
 */
export async function pollComms(onlyVendor) {
  if (running) return { skipped: 'already running' };
  running = true;
  try {
    const all = (await quoConfigs()).filter(c => onlyVendor == null || c.vendorId === Number(onlyVendor));
    const ready = all.filter(c => c.ready);
    if (!ready.length) return { skipped: 'not configured', missing: (all[0] || (onlyVendor != null ? await quoConfig(onlyVendor) : { missing: ['the API key'] })).missing };
    let added = 0, filled = 0, failed = 0, error = null;
    for (const cfg of ready) {
      const r = await pollOne(cfg).catch(e => ({ error: e.message }));   // one vendor failing never stops the others
      if (r.error) { error = error || r.error; console.error(`[comms] poll (vendor ${cfg.vendorId}):`, r.error); }
      added += r.added || 0; filled += r.filled || 0; failed += r.failed || 0;
    }
    return error && !added && ready.length === 1 ? { error } : { added, filled, failed };
  } catch (e) {
    console.error('[comms] poll error:', e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}

/** One vendor's lines, conversations, calls and messages. */
async function pollOne(cfg) {
  /* ⚠️ Quo lists calls and messages only per conversation (it refuses a
     request without `participants`), so: which numbers → which
     conversations moved → that conversation's calls and messages. */
  const numberIds = cfg.phoneNumberId
    ? [cfg.phoneNumberId]
    : (await listPhoneNumbers(cfg.key)).map(n => n.id);
  const ours = await ownNumbers(cfg.key);              // so a call is never filed under our own number

  let added = 0, asked = 0;
  const failures = [];
  for (const phoneNumberId of numberIds) {
    /* From the newest thing already held ON THIS LINE, minus a small
       overlap. Taken across every line, a newly chosen number started from
       the old line's latest message and its own history was never fetched.
       A line seen for the first time gets a month. The upsert makes
       re-seeing an event free. */
    const newest = await privateDb.comms_events.findFirst({
      where: { vendor_id: cfg.vendorId, line_id: phoneNumberId },
      orderBy: { occurred_at: 'desc' },
      select: { occurred_at: true },
    });
    const since = newest
      ? new Date(newest.occurred_at.getTime() - 5 * 60_000)
      : new Date(Date.now() - 30 * 864e5);

    let convs;
    try { convs = await listConversations(cfg.key, { phoneNumberId, updatedAfter: since }); asked++; }
    catch (e) { failures.push(e.message); continue; }
    for (const c of convs) {
      const participants = (c.participants || []).filter(Boolean);
      if (!participants.length) continue;
      for (const [fetch_, type] of [[listCalls, 'call'], [listMessages, 'message']]) {
        let rows;
        try { rows = await fetch_(cfg.key, { phoneNumberId, participants, since, max: 100 }); asked++; }
        catch (e) { failures.push(e.message); continue; }   // one failing must not stop the rest
        for (const r of rows) {
          const row = normalise(type, r, ours);
          if (!row) continue;
          row.line_id = row.line_id || phoneNumberId;          // we asked for this line, so it is this line
          const stored = await upsertEvent(cfg.vendorId, row);
          if (stored === 'created') added++;                  // re-seen ones are not "new"
          if (stored) await announce(cfg.vendorId, row, cfg.phoneNumberId || null);   // 🔔 once per event, if the webhook missed it
        }
      }
    }
  }
  if (failures.length) console.error('[comms] poll:', failures.length, 'request(s) failed —', failures[0]);
  /* Nothing got through at all → that is an error, said out loud. A sync
     that failed every request and still answered "done, 0 new" is exactly
     how this went unnoticed. */
  if (failures.length && !asked) return { error: `Quo refused the sync: ${failures[0]}` };

  /* 🎧 Then what happened ON the calls (recording, summary, transcript),
     and names for the numbers. Their own failures must not undo the sync. */
  let filled = 0;
  try { filled = await enrichPending(cfg); } catch (e) { console.error('[comms] filling calls:', e.message); }
  try { await fillContactNames(cfg); } catch (e) { console.error('[comms] contact names:', e.message); }
  // 📋 leads Raj asked for whose transcript has now arrived
  try { await processLeadRequests(cfg.vendorId); } catch (e) { console.error('[comms] leads from calls:', e.message); }
  return { added, filled, failed: failures.length };
}
