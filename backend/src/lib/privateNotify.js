/**
 * 🔔 A bell notification about a call or a text — stored in Perfect Poses'
 * own database beside the call it is about (comms_notices), not in iwopo's
 * shared notifications table: "💬 New text from …" carries a snippet of the
 * text itself. The bell reads both (routes/notifications.js).
 * Same shape and meaning as notify() in routes/notifications.js.
 */
import privateDb from '../config/privateDb.js';

export async function notifyPrivate(vendorId, title, body, type = 'comms', link = null) {
  try {
    await privateDb.comms_notices.create({
      data: {
        vendor_id: Number(vendorId),
        type,
        title: String(title).slice(0, 200),
        body: body ? String(body).slice(0, 400) : null,
        link_type: link?.type || null,
        link_id: link?.id != null ? Number(link.id) : null,
      },
    });
  } catch (e) { console.error('[comms] notice not saved:', e.message); }   // never break the main flow
}
