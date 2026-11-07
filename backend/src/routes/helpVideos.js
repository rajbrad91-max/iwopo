/**
 * 🎬 Video guides for Help & Support (Raj, 2026-11-07). Vendors read the list; Super Admin adds a YouTube link (any
 * of its usual forms) or removes one. Only the video id is kept, and the page embeds it from youtube-nocookie.com.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { serverError } from '../lib/httpError.js';

const router = express.Router();
/** The 11-character id from a YouTube link: watch?v=, youtu.be/, shorts/, embed/, live/ — or the id itself. */
export function youtubeId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
const list = () => prisma.help_videos.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }], select: { id: true, title: true, youtube_id: true, sort_order: true } });

router.get('/help/videos', requireAuth, async (req, res) => {
  try { res.json({ videos: await list() }); } catch (e) { serverError(res, e); }
});
router.post('/admin/help-videos', requireAuth, requireSuperAdmin, async (req, res) => {
  const id = youtubeId(req.body?.url);
  const title = String(req.body?.title || '').trim().slice(0, 140);
  if (!id) return res.status(400).json({ error: 'That is not a YouTube link we can read — paste the video’s address.' });
  if (!title) return res.status(400).json({ error: 'Give the video a title.' });
  try {
    await prisma.help_videos.create({ data: { title, youtube_id: id, sort_order: Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 0 } });
    res.status(201).json({ videos: await list() });
  } catch (e) { serverError(res, e); }
});
router.delete('/admin/help-videos/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try { await prisma.help_videos.deleteMany({ where: { id: Number(req.params.id) } }); res.json({ videos: await list() }); }
  catch (e) { serverError(res, e); }
});
export default router;
