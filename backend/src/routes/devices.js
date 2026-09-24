/**
 * 🔑 Device tokens — a watcher on a laptop, authenticating as itself.
 *
 * 🔒 Every route here is for a PERSON. A device cannot mint another device,
 * list its siblings or revoke anything; requireAuth refuses a device token
 * outright, which is what keeps a stolen laptop from becoming a foothold.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { mintToken } from '../lib/deviceAuth.js';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);

/** GET /api/devices — what is connected, and whether it is alive. */
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const rows = await prisma.device_tokens.findMany({
      where: { vendor_id: v, revoked_at: null },        // 🔒 tenancy
      /* token_hash is deliberately absent. A list that can show its own
         credentials is a list of working keys. */
      select: { id: true, name: true, scope: true, last_used: true, last_ip: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    res.json({ devices: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/devices — mint one.
 *
 * The plain token comes back exactly once. There is no route that can reveal
 * it again, because storing it in a form anybody could reopen would undo the
 * point of hashing it.
 */
router.post('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Give the device a name, so you know which laptop it is.' });

    const { plain, hash } = mintToken();
    const row = await prisma.device_tokens.create({
      data: { vendor_id: v, name, token_hash: hash, scope: 'upload' },
      select: { id: true, name: true, created_at: true },
    });
    res.status(201).json({ device: row, token: plain, note: 'Copy this now — it cannot be shown again.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * DELETE /api/devices/:id — revoke.
 *
 * Marked revoked rather than deleted, so the record of what was connected and
 * when it last ran survives. A laptop that goes missing at a wedding is
 * switched off here and the token is dead on the next request.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { count } = await prisma.device_tokens.updateMany({
      where: { id: Number(req.params.id), vendor_id: v, revoked_at: null },   // 🔒 tenancy
      data: { revoked_at: new Date() },
    });
    if (!count) return res.status(404).json({ error: 'Device not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
