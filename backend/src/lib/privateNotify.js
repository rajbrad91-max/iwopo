/**
 * 🔔 A bell notification about a call or a text — stored in Perfect Poses'
 * own database beside the call it is about (comms_notices), not in iwopo's
 * shared notifications table: "💬 New text from …" carries a snippet of the
 * text itself. The bell reads both (routes/notifications.js).
 * Same shape and meaning as notify() in routes/notifications.js.
 */
import privateDb from '../config/privateDb.js';
import { pushToVendor } from './agentPush.js';

export async function notifyPrivate(vendorId, title, body, type = 'comms', link = null) {
  try {
    // 🕐 the call's / text's own time from Quo, never the moment iwopo imported it (a late sync shows the true time)
    const ev = link?.type === 'comms' && link.id != null
      ? await privateDb.comms_events.findUnique({ where: { id: Number(link.id) }, select: { occurred_at: true } }).catch(() => null) : null;
    await privateDb.comms_notices.create({
      data: {
        vendor_id: Number(vendorId),
        occurred_at: ev?.occurred_at || null,
        type,
        title: String(title).slice(0, 200),
        body: body ? String(body).slice(0, 400) : null,
        link_type: link?.type || null,
        link_id: link?.id != null ? Number(link.id) : null,
      },
    });
  } catch (e) { console.error('[comms] notice not saved:', e.message); }   // never break the main flow
  // 🔔 a missed call or a text, as a pop-up on the vendor's devices (AI Agent)
  pushToVendor(vendorId, title, body).catch(() => {});
}
