import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

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
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const v = Number(vid(req));
    const notifications = await prisma.notifications.findMany({
      where: { vendor_id: v },                   // 🔒 tenancy
      orderBy: { created_at: 'desc' },
      take: 30,
    });
    const unseen = await prisma.notifications.count({
      where: { vendor_id: v, seen_at: null },    // 🔒 tenancy
    });
    res.json({ notifications, unseen });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/seen', requireAuth, async (req, res) => {
  try {
    await prisma.notifications.updateMany({
      where: { vendor_id: Number(vid(req)), seen_at: null },   // 🔒 tenancy on the write
      data: { seen_at: new Date() },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
