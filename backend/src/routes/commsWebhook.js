/**
 * 📞 Where Quo pushes calls and messages the moment they happen.
 *
 * ⚠️ This is a PUBLIC endpoint — anything on the internet can POST to it. So
 * nothing is trusted until the signature checks out. Without that, it is a
 * public write into somebody's call history: a fabricated call from a number
 * they recognise, or a message they never received.
 *
 * The raw body is needed for the HMAC, so this router is mounted BEFORE
 * express.json() with its own raw parser. Parsing first and re-stringifying
 * changes the bytes — key order, whitespace — and the signature then fails for
 * reasons that look like a wrong secret.
 */
import express from 'express';
import privateDb from '../config/privateDb.js';
import { quoConfig, verifyWebhook, ownNumbers, otherParticipant } from '../lib/quo.js';
import { enrichCall, CALL_FIELDS } from '../lib/commsEnrich.js';
import { announce } from '../lib/commsNotify.js';
import { ringScreens } from '../lib/commsPop.js';
import { processLeadRequests } from '../lib/callLeads.js';

const router = express.Router();

/**
 * Quo's shapes differ between calls and messages; this flattens both.
 * @param {Set<string>} ours  the vendor's own numbers (last ten digits) — see ownNumbers()
 */
export function normalise(type, data, ours = new Set()) {
  const isCall = String(type || '').startsWith('call');
  const id = data?.id;
  if (!id) return null;

  const occurred = data?.createdAt || data?.completedAt || data?.answeredAt || new Date().toISOString();
  /* A CALL has no from/to — Quo gives `participants` and a direction. And
     `participants` lists OUR line too, beside the caller: the first entry was
     sometimes us, which filed the call under our own number. */
  const other = otherParticipant(data?.participants, ours);
  const outgoing = data?.direction === 'outgoing';
  const fromNum = data?.from?.phoneNumber || (typeof data?.from === 'string' ? data.from : null) || (!outgoing ? other : null);
  const toNum = (Array.isArray(data?.to) ? (data.to[0]?.phoneNumber || data.to[0]) : (data?.to?.phoneNumber || (typeof data?.to === 'string' ? data.to : null))) || (outgoing ? other : null);
  return {
    external_id: String(id).slice(0, 80),
    /* 📞 WHICH of the vendor's Quo numbers this happened on. Without it,
       switching the number in Super Admin could not hide the old line's
       calls — and the new line's history was never fetched, because "newest
       event held" was taken across every line. */
    line_id: data?.phoneNumberId ? String(data.phoneNumberId).slice(0, 40) : null,
    kind: isCall ? 'call' : 'message',
    direction: outgoing ? 'outgoing' : 'incoming',
    status: data?.status ? String(data.status).slice(0, 24) : null,
    from_number: fromNum ? String(fromNum).slice(0, 32) : null,
    to_number: toNum ? String(toNum).slice(0, 32) : null,
    contact_name: null,
    body: isCall ? (data?.summary || null) : (data?.text || data?.body || null),
    /* Quo delivers a transcript in a LATER event than the call itself, so this
       is usually null here and filled in by the update below. */
    transcript: null,
    /* A call's own recording link EXPIRES, so it is never stored — enrichCall
       marks it as available and the audio is fetched fresh on play. */
    recording_url: isCall ? null : (data?.media?.[0]?.url || null),
    duration_sec: Number.isFinite(Number(data?.duration)) ? Math.round(Number(data.duration)) : null,
    occurred_at: new Date(occurred),
  };
}

/**
 * Store one event, or update what is already there.
 *
 * Both the webhook and the poller deliver the same events, so this must be
 * safe to run twice — a duplicate in a timeline reads as the client having
 * rung twice, which is worse than a gap.
 *
 * @returns {'created'|'updated'|false} — which of the two happened. A plain
 *   `true` for both made every Sync report the same messages as "new" again.
 */
export async function upsertEvent(vendorId, row) {
  if (!row?.external_id) return false;
  try {
    const had = await privateDb.comms_events.findUnique({ where: { external_id: row.external_id }, select: { id: true } });
    await privateDb.comms_events.upsert({
      where: { external_id: row.external_id },
      /* Only fills gaps. A transcript or recording arriving later must not wipe
         a summary that came with the call. */
      update: {
        line_id: row.line_id ?? undefined,     // stamps events stored before the line was recorded
        from_number: row.from_number ?? undefined,   // calls stored before their number was read
        to_number: row.to_number ?? undefined,
        status: row.status ?? undefined,
        body: row.body ?? undefined,
        transcript: row.transcript ?? undefined,
        recording_url: row.recording_url ?? undefined,
        duration_sec: row.duration_sec ?? undefined,
      },
      create: { ...row, vendor_id: Number(vendorId) },
    });
    return had ? 'updated' : 'created';
  } catch { return false; }
}

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const cfg = await quoConfig();
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');

    const check = verifyWebhook(raw, req.headers, cfg.webhookSecrets);
    if (!check.ok) {
      /* Terse to the caller — a detailed rejection tells somebody probing the
         endpoint which part of their forgery to fix — but the REASON goes to
         the log, because a silent 401 is exactly how a wrong parser hid for a
         day behind a sync that kept the texts arriving anyway. */
      console.error(`[comms] webhook refused (${check.scheme}): ${check.why}`);
      return res.status(401).json({ error: 'bad signature' });
    }
    if (!cfg.vendorId) return res.status(200).json({ ok: true, skipped: 'no vendor configured' });

    const payload = JSON.parse(raw);
    const type = String(payload?.type || '');
    const obj = payload?.data?.object || payload?.data;

    /* 🎧 "The summary / transcript / recording for call X is ready." These
       carry the CALL's id, not an event of their own — treating them as a new
       event made rows with no id or the wrong one. Fill the call instead. */
    if (/^call\.(summary|transcript|recording)\./.test(type)) {
      const callId = obj?.callId || obj?.id;
      const ev = callId && await privateDb.comms_events.findFirst({
        where: { external_id: String(callId), vendor_id: cfg.vendorId },
        select: CALL_FIELDS,
      });
      if (ev) {
        await enrichCall(cfg.key, ev).catch(() => {});
        await processLeadRequests(cfg.vendorId).catch(() => {});   // 📋 a lead Raj asked for can be made now
      }
      return res.json({ ok: true });
    }

    const ours = await ownNumbers(cfg.key).catch(() => new Set());
    const row = normalise(type, obj, ours);
    // a genuine delivery we cannot read is worth knowing about — its field names only, never its content
    if (!row) console.error(`[comms] webhook "${type}" not understood — fields: ${Object.keys(obj || {}).join(',')}`);
    if (row && await upsertEvent(cfg.vendorId, row)) {
      await ringScreens(cfg.vendorId, row, cfg.phoneNumberId || null);   // 📞 screen pop while it rings
      await announce(cfg.vendorId, row, cfg.phoneNumberId || null);      // 🔔 a text in, or a missed call
    }

    /* 200 whatever happens after the signature passes. Quo retries on an
       error, and retrying an event that was simply unrecognised achieves
       nothing except more of the same. */
    res.json({ ok: true });
  } catch {
    res.status(200).json({ ok: true, note: 'accepted' });
  }
});

export default router;
