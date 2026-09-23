/**
 * 📇 Contacts — the people a vendor sends things to.
 *
 * These belong to File Flyer and nothing else. They exist for one purpose —
 * choosing who a file goes to — and are deliberately unconnected to Leads: a
 * lead is somebody who might book, while a contact is often somebody who never
 * would, like the editor or the second shooter. Raj asked for the two kept
 * completely apart, so there is no import between them and no shared row.
 *
 * 🔒 Every query is scoped by the vendor id on the token. The id is never read
 * from the body, and a contact belonging to another vendor is a 404 rather than
 * a 403, so this cannot be used to discover which ids exist.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const vid = (req) => Number(req.user?.vendor_id);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Trim, cap and validate what the vendor typed. */
function clean(body) {
  const name = String(body?.name || '').trim().slice(0, 200);
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 320);
  if (!name) return { error: 'A name is needed' };
  if (!EMAIL.test(email)) return { error: 'That email address does not look right' };
  return {
    name, email,
    phone: String(body?.phone || '').trim().slice(0, 60) || null,
    note: String(body?.note || '').trim().slice(0, 500) || null,
  };
}

/** GET /api/contacts — everyone, newest name order, with a search. */
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const q = String(req.query.q || '').trim();
    const rows = await prisma.contacts.findMany({
      where: {
        vendor_id: v,                                   // 🔒 tenancy
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
    res.json({ contacts: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/contacts — add one. */
router.post('/', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ error: c.error });

    /* The unique index is case-insensitive, so this is a friendly message for
       a collision the database would refuse anyway. */
    const dup = await prisma.contacts.findFirst({
      where: { vendor_id: v, email: { equals: c.email, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (dup) return res.status(409).json({ error: `${dup.name} already uses that email`, id: dup.id });

    const row = await prisma.contacts.create({
      data: { ...c, vendor_id: v },
    });
    res.status(201).json({ contact: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** PUT /api/contacts/:id */
router.put('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ error: c.error });

    // 🔒 scoped by vendor, so another vendor's id simply matches nothing
    const { count } = await prisma.contacts.updateMany({
      where: { id: Number(req.params.id), vendor_id: v },
      data: { ...c, updated_at: new Date() },
    });
    if (!count) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact: await prisma.contacts.findUnique({ where: { id: Number(req.params.id) } }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** DELETE /api/contacts/:id — the share history goes with it (cascade). */
router.delete('/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { count } = await prisma.contacts.deleteMany({
      where: { id: Number(req.params.id), vendor_id: v },   // 🔒 tenancy
    });
    if (!count) return res.status(404).json({ error: 'Contact not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
