import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

/* ── 👷 CREW MEMBERS (vendor roster) ── */
router.get('/', requireAuth, async (req, res) => {
  try {
    const crew = await prisma.crew_members.findMany({
      where: { vendor_id: Number(vid(req)) },    // 🔒 tenancy
      orderBy: { name: 'asc' },
    });
    res.json({ crew });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, role, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const member = await prisma.crew_members.create({
      data: {
        vendor_id: Number(vid(req)),             // 🔒 tenancy
        name, role: role || null, phone: phone || null, email: email || null,
      },
    });
    res.status(201).json({ member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.crew_members.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const { name, role, phone, email } = req.body;
    const data = { role: role ?? null, phone: phone ?? null, email: email ?? null };
    if (name !== undefined && name !== null) data.name = name;   // COALESCE($1,name)
    const member = await prisma.crew_members.update({ where: { id }, data });
    res.json({ member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.crew_members.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.crew_members.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── 📅 EVENT CREW (assign to lead + schedule) ── */
async function leadOwned(req, res, leadId) {
  const lead = await prisma.leads.findUnique({ where: { id: Number(leadId) } });
  if (!lead) { res.status(404).json({ error: 'Lead not found' }); return null; }
  if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) {
    res.status(403).json({ error: 'Forbidden' }); return null;    // 🔒 tenancy
  }
  return lead;
}

router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await leadOwned(req, res, req.params.leadId);
    if (!lead) return;
    const rows = await prisma.lead_crew.findMany({
      where: { lead_id: lead.id },
      orderBy: { id: 'asc' },
      include: { crew_members: { select: { name: true, role: true, phone: true, email: true } } },
    });
    const assignments = rows.map(({ crew_members, ...a }) => ({
      ...a,
      name: crew_members?.name ?? null, role: crew_members?.role ?? null,
      phone: crew_members?.phone ?? null, email: crew_members?.email ?? null,
    }));
    res.json({ assignments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await leadOwned(req, res, req.params.leadId);
    if (!lead) return;
    const { crew_member_id, duty, arrive_time, leave_time } = req.body;
    if (!crew_member_id) return res.status(400).json({ error: 'crew_member_id required' });
    // 🔒 tenancy: the crew member must belong to the same vendor as the lead,
    // otherwise one vendor could attach another vendor's staff to their event.
    const member = await prisma.crew_members.findFirst({
      where: { id: Number(crew_member_id), vendor_id: lead.vendor_id },
      select: { id: true },
    });
    if (!member) return res.status(400).json({ error: 'Crew member not found' });
    const assignment = await prisma.lead_crew.create({
      data: {
        lead_id: lead.id, crew_member_id: member.id,
        duty: duty || null, arrive_time: arrive_time || null, leave_time: leave_time || null,
        checkin_token: crypto.randomBytes(16).toString('hex'),
      },
    });
    res.status(201).json({ assignment });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/assignment/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.lead_crew.findUnique({
      where: { id },
      select: { leads: { select: { vendor_id: true } } },
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && row.leads?.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.lead_crew.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── ✅ PUBLIC CHECK-IN (crew taps link) ── */
router.get('/checkin/:token', async (req, res) => {
  try {
    const a = await prisma.lead_crew.findFirst({
      where: { checkin_token: req.params.token },   // the token is the access key
      include: {
        crew_members: { select: { name: true } },
        leads: { select: { event_type: true, event_date: true, location: true, name: true } },
      },
    });
    if (!a) return res.status(404).json({ error: 'Invalid link' });
    const { crew_members, leads, ...rest } = a;
    res.json({
      assignment: {
        ...rest,
        name: crew_members?.name ?? null,
        event_type: leads?.event_type ?? null, event_date: leads?.event_date ?? null,
        location: leads?.location ?? null, client_name: leads?.name ?? null,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/checkin/:token', async (req, res) => {
  try {
    const { action } = req.body; // in | out
    const a = await prisma.lead_crew.findFirst({ where: { checkin_token: req.params.token }, select: { id: true } });
    if (!a) return res.status(404).json({ error: 'Invalid link' });
    const data = action === 'out' ? { checked_out_at: new Date() } : { checked_in_at: new Date() };
    const assignment = await prisma.lead_crew.update({ where: { id: a.id }, data });
    res.json({ assignment });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
