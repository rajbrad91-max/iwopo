import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import privateDb from '../config/privateDb.js';
import { quoConfig } from '../lib/quo.js';

const router = express.Router();
function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

/* ── 🔔 NOTIFICATIONS ── */
/**
 * Raise a notification for a vendor.
 *
 * `link` is what the notification is ABOUT, so the bell can send the vendor
 * straight there instead of dropping them on a list to go hunting. Shape:
 *   { type: 'lead', id: 42 }   → opens that lead
 *   { type: 'aichat' }         → opens the AI Chat tab (no single record)
 * Left null the row still renders, it just isn't clickable — which is what
 * every notification raised before this column existed will do.
 */
import { pushToVendor } from '../lib/agentPush.js';

export async function notify(vendorId, title, body, type = 'info', link = null) {
  try {
    await prisma.notifications.create({
      data: {
        vendor_id: Number(vendorId),
        type,
        title,
        body: body || null,
        link_type: link?.type || null,
        link_id: link?.id != null ? Number(link.id) : null,
      },
    });
  } catch { /* never break main flow */ }
  // 🔔 also as a pop-up on the vendor's devices (AI Agent, private feature)
  pushToVendor(vendorId, title, body).catch(() => {});
}

/* 🔒 The private notifications (calls and texts) live in Perfect Poses' own
   database, and only the vendor Quo is connected to has any. Every other
   vendor's bell never touches that database at all. */
async function privateOwner(v) {
  const cfg = await quoConfig().catch(() => null);
  return !!cfg?.vendorId && cfg.vendorId === v;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const v = Number(vid(req));
    const [shared, sharedUnseen] = await Promise.all([
      prisma.notifications.findMany({
        where: { vendor_id: v },                 // 🔒 tenancy
        orderBy: { created_at: 'desc' },
        take: 30,
      }),
      prisma.notifications.count({ where: { vendor_id: v, seen_at: null } }),   // 🔒 tenancy
    ]);
    let notifications = shared, unseen = sharedUnseen;
    if (await privateOwner(v)) {
      const [mine, mineUnseen] = await Promise.all([
        privateDb.comms_notices.findMany({ where: { vendor_id: v }, orderBy: { created_at: 'desc' }, take: 30 }),
        privateDb.comms_notices.count({ where: { vendor_id: v, seen_at: null } }),
      ]);
      /* one list, newest first. A private row's id is prefixed so it can
         never be mistaken for an iwopo notification with the same number. */
      notifications = [...shared, ...mine.map(n => ({ ...n, id: `p${n.id}` }))]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 30);
      unseen += mineUnseen;
    }
    res.json({ notifications, unseen });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/seen', requireAuth, async (req, res) => {
  try {
    const v = Number(vid(req));
    await prisma.notifications.updateMany({
      where: { vendor_id: v, seen_at: null },   // 🔒 tenancy on the write
      data: { seen_at: new Date() },
    });
    if (await privateOwner(v)) {
      await privateDb.comms_notices.updateMany({ where: { vendor_id: v, seen_at: null }, data: { seen_at: new Date() } });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
