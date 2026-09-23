/**
 * 📇 Contacts — the people a vendor sends things to.
 *
 * Kept apart from `leads` on purpose. A lead is somebody who might book and
 * carries sales state; a contact is simply somebody you send files to, and is
 * often not a lead at all — the editor, the second shooter, the venue
 * coordinator. A contact can be created FROM a lead so the couple already in
 * the system is not typed twice.
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
      data: { ...c, vendor_id: v, from_lead_id: req.body?.from_lead_id ? Number(req.body.from_lead_id) : null },
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

/**
 * POST /api/contacts/from-leads — pull people already in the system.
 *
 * A vendor talking to a couple should not have to type their address again.
 * Leads without an email are skipped, and anyone already a contact is left
 * alone rather than duplicated.
 */
router.post('/from-leads', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const leads = await prisma.leads.findMany({
      where: { vendor_id: v, email: { not: null } },        // 🔒 tenancy
      select: { id: true, name: true, email: true, phone: true },
    });
    const existing = new Set(
      (await prisma.contacts.findMany({ where: { vendor_id: v }, select: { email: true } }))
        .map(c => c.email.toLowerCase()),
    );

    const fresh = [];
    for (const l of leads) {
      const email = String(l.email || '').trim().toLowerCase();
      if (!EMAIL.test(email) || existing.has(email)) continue;
      existing.add(email);                                  // a lead list can repeat an address
      fresh.push({
        vendor_id: v, name: String(l.name || email).slice(0, 200), email,
        phone: l.phone ? String(l.phone).slice(0, 60) : null, from_lead_id: l.id,
      });
    }
    if (fresh.length) await prisma.contacts.createMany({ data: fresh, skipDuplicates: true });
    res.json({ added: fresh.length, skipped: leads.length - fresh.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
