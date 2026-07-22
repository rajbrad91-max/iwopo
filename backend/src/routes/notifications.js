import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

/* ── 🔔 NOTIFICATIONS ── */
export async function notify(vendorId, title, body, type = 'info') {
  try {
    await prisma.notifications.create({
      data: { vendor_id: Number(vendorId), type, title, body: body || null },
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
