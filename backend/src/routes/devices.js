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
import { mintToken, deviceOrAuth } from '../lib/deviceAuth.js';
import crypto from 'node:crypto';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);

/**
 * 🎥 GET /api/devices/albums → the live shoots this device may upload into.
 *
 * The watcher's own setup window needs to offer a list to choose from, and a
 * device token cannot reach /api/albums — it is upload-only, deliberately.
 *
 * 🔒 So this is a narrow window rather than opening that route: ids and titles
 * of live shoots belonging to this vendor, and nothing else. No passwords, no
 * client emails, no expiry, no galleries. A token on a laptop learns the names
 * of the events it is already uploading to, which it could infer anyway.
 */
router.get('/albums', deviceOrAuth, async (req, res) => {
  const v = Number(req.user?.vendor_id);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const albums = await prisma.albums.findMany({
      where: { vendor_id: v, kind: 'liveshoot' },       // 🔒 tenancy
      select: { id: true, title: true },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    res.json({ albums });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * 🎥 POST /api/devices/albums → start a live shoot from the watcher.
 *
 * The setup window can otherwise do everything except the one thing you need
 * before a shoot, which sends somebody back to the panel at the worst moment.
 *
 * 🔒 Narrow on purpose: it makes a live shoot and nothing else. The kind is
 * forced rather than taken from the request, so a device cannot quietly create
 * an ordinary gallery — one shows everybody everything, and that is not a
 * decision a token on a laptop should be able to make.
 */
router.post('/albums', deviceOrAuth, async (req, res) => {
  const v = Number(req.user?.vendor_id);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  try {
    const title = String(req.body?.title || '').trim().slice(0, 160);
    if (!title) return res.status(400).json({ error: 'Give the shoot a name.' });

    const album = await prisma.albums.create({
      data: {
        vendor_id: v, title,
        kind: 'liveshoot',                                  // 🔒 never from the body
        public_token: crypto.randomBytes(16).toString('hex'),
        face_ai: true,                                      // a live shoot is pointless without it
      },
      select: { id: true, title: true, public_token: true },
    });
    res.status(201).json({ album });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
