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
import prisma from '../config/prisma.js';
import { quoConfig, verifyWebhook } from '../lib/quo.js';

const router = express.Router();

/** Quo's shapes differ between calls and messages; this flattens both. */
export function normalise(type, data) {
  const isCall = String(type || '').startsWith('call');
  const id = data?.id;
  if (!id) return null;

  const occurred = data?.createdAt || data?.completedAt || data?.answeredAt || new Date().toISOString();
  return {
    external_id: String(id).slice(0, 80),
    kind: isCall ? 'call' : 'message',
    direction: data?.direction === 'outgoing' ? 'outgoing' : 'incoming',
    status: data?.status ? String(data.status).slice(0, 24) : null,
    from_number: data?.from?.phoneNumber || data?.from || null,
    to_number: Array.isArray(data?.to) ? (data.to[0]?.phoneNumber || data.to[0]) : (data?.to?.phoneNumber || data?.to || null),
    contact_name: null,
    body: isCall ? (data?.summary || null) : (data?.text || data?.body || null),
    /* Quo delivers a transcript in a LATER event than the call itself, so this
       is usually null here and filled in by the update below. */
    transcript: null,
    recording_url: data?.media?.[0]?.url || data?.recordingUrl || null,
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
 */
export async function upsertEvent(vendorId, row) {
  if (!row?.external_id) return false;
  try {
    await prisma.comms_events.upsert({
      where: { external_id: row.external_id },
      /* Only fills gaps. A transcript or recording arriving later must not wipe
         a summary that came with the call. */
      update: {
        status: row.status ?? undefined,
        body: row.body ?? undefined,
        transcript: row.transcript ?? undefined,
        recording_url: row.recording_url ?? undefined,
        duration_sec: row.duration_sec ?? undefined,
      },
      create: { ...row, vendor_id: Number(vendorId) },
    });
    return true;
  } catch { return false; }
}

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const cfg = await quoConfig();
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');

    if (!verifyWebhook(raw, req.headers['openphone-signature'], cfg.webhookSecret)) {
      /* Deliberately terse. A detailed rejection tells somebody probing the
         endpoint exactly which part of their forgery to fix. */
      return res.status(401).json({ error: 'bad signature' });
    }
    if (!cfg.vendorId) return res.status(200).json({ ok: true, skipped: 'no vendor configured' });

    const payload = JSON.parse(raw);
    const row = normalise(payload?.type, payload?.data?.object || payload?.data);
    if (row) await upsertEvent(cfg.vendorId, row);

    /* 200 whatever happens after the signature passes. Quo retries on an
       error, and retrying an event that was simply unrecognised achieves
       nothing except more of the same. */
    res.json({ ok: true });
  } catch {
    res.status(200).json({ ok: true, note: 'accepted' });
  }
});

export default router;
