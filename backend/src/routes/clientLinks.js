/**
 * 🔗 A vendor's optional client-page links (lib/clientLinks.js): GET what is saved, PUT the whole set.
 * 🔒 The vendor is always the signed-in one — never an id from the request.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { serverError } from '../lib/httpError.js';
import { cleanLinks, SOCIALS } from '../lib/clientLinks.js';

const router = express.Router();
const FIELDS = ['title_url', 'private_url', 'button1_label', 'button1_url', 'button2_label', 'button2_url', ...SOCIALS, 'footer_phone', 'footer_email', 'footer_address'];
const asForm = (r) => Object.fromEntries(FIELDS.map(f => [f, r?.[f] || '']));

router.get('/', requireAuth, async (req, res) => {
  const v = req.user?.vendor_id;
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try { res.json({ links: asForm(await prisma.client_links.findUnique({ where: { vendor_id: v } })) }); }
  catch (e) { serverError(res, e); }
});

router.put('/', requireAuth, async (req, res) => {
  const v = req.user?.vendor_id;
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  const { data, error } = cleanLinks(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const saved = await prisma.client_links.upsert({ where: { vendor_id: v }, create: { vendor_id: v, ...data }, update: { ...data, updated_at: new Date() } });
    res.json({ links: asForm(saved) });
  } catch (e) { serverError(res, e); }
});

export default router;
