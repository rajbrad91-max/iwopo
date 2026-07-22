import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary } from './payments.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}
function ipOf(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '').replace('::ffff:', '');
}
async function audit(contractId, event, ip, meta) {
  await prisma.contract_audit.create({
    data: { contract_id: contractId, event, ip: ip || null, meta: meta ?? null },
  });
}

// 🔤 Fill placeholders from lead + package + money
async function fillPlaceholders(text, lead, businessName) {
  const money = await moneySummary(lead);
  let pkgName = '—';
  if (lead.package_snapshot) {
    const p = typeof lead.package_snapshot === 'string' ? JSON.parse(lead.package_snapshot) : lead.package_snapshot;
    pkgName = p.name || '—';
  }
  const map = {
    '{{client_name}}': lead.name || '—',
    '{{client_email}}': lead.email || '—',
    '{{event_type}}': lead.event_type || '—',
    '{{event_date}}': lead.event_date ? String(lead.event_date).slice(0, 10) : '—',
    '{{location}}': lead.location || '—',
    '{{hours}}': lead.hours ?? '—',
    '{{guests}}': lead.guests ?? '—',
    '{{package_name}}': pkgName,
    '{{total_cost}}': `$${money.final_total}`,
    '{{deposit}}': `$${money.deposit_amount}`,
    '{{balance}}': `$${money.balance}`,
    '{{today_date}}': new Date().toISOString().slice(0, 10),
    '{{company_name}}': businessName || '—',
  };
  let out = text;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(String(v));
  return out;
}

/* ───────── 📑 TEMPLATES ───────── */
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    if (!v) return res.status(400).json({ error: 'No vendor' });
    const templates = await prisma.contract_templates.findMany({
      where: { vendor_id: Number(v) },          // 🔒 tenancy
      orderBy: { id: 'asc' },
    });
    res.json({ templates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/templates', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    if (!v) return res.status(400).json({ error: 'No vendor' });
    const { name, event_type, header, body, legal_terms } = req.body;
    const template = await prisma.contract_templates.create({
      data: {
        vendor_id: Number(v),                   // 🔒 tenancy
        name: name || 'My Contract',
        event_type: event_type || null,
        header: header || '', body: body || '', legal_terms: legal_terms || '',
      },
    });
    res.status(201).json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/templates/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.contract_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const { name, event_type, header, body, legal_terms } = req.body;
    // COALESCE($n, col): only overwrite what was supplied (event_type is always set)
    const data = { event_type: event_type ?? null, updated_at: new Date() };
    if (name !== undefined && name !== null) data.name = name;
    if (header !== undefined && header !== null) data.header = header;
    if (body !== undefined && body !== null) data.body = body;
    if (legal_terms !== undefined && legal_terms !== null) data.legal_terms = legal_terms;
    const template = await prisma.contract_templates.update({ where: { id }, data });
    res.json({ template });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/templates/:id', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    const id = Number(req.params.id);
    const own = await prisma.contract_templates.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!own) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own.vendor_id !== v) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    await prisma.contract_templates.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ───────── 📄 CONTRACTS (vendor side) ───────── */
// all my contracts (for sidebar tab)
router.get('/', requireAuth, async (req, res) => {
  try {
    const v = vid(req);
    if (!v && req.user.role !== 'super_admin') return res.status(400).json({ error: 'No vendor' });
    const rows = await prisma.contracts.findMany({
      where: v ? { vendor_id: Number(v) } : {},  // 🔒 tenancy (super_admin may span vendors)
      orderBy: { created_at: 'desc' },
      include: { leads: { select: { name: true, event_type: true } } },
    });
    const contracts = rows.map(({ leads, ...c }) => ({
      ...c, client_name: leads?.name ?? null, lead_event: leads?.event_type ?? null,
    }));
    res.json({ contracts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.leadId);
    const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { vendor_id: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const contracts = await prisma.contracts.findMany({
      where: { lead_id: leadId },
      orderBy: { created_at: 'desc' },
    });
    res.json({ contracts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// create from raw text OR template (template_id) — placeholders auto-filled
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  try {
    const { title, body, template_id } = req.body;
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy

    let text = body, ctTitle = title || 'Service Agreement';
    if (template_id) {
      const t = await prisma.contract_templates.findFirst({
        where: { id: Number(template_id), vendor_id: lead.vendor_id },   // 🔒 tenancy
      });
      if (!t) return res.status(400).json({ error: 'Template not found' });
      text = [t.header, t.body, t.legal_terms].filter(Boolean).join('\n\n');
      ctTitle = title || t.name;
    }
    if (!text || !text.trim()) return res.status(400).json({ error: 'Contract text required' });

    const vendor = await prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { business_name: true } });
    const filled = await fillPlaceholders(text, lead, vendor?.business_name);

    const contract = await prisma.contracts.create({
      data: {
        vendor_id: lead.vendor_id,             // 🔒 stamped from the owning lead
        lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        title: ctTitle, body: filled, status: 'sent',
      },
    });
    await audit(contract.id, 'created', ipOf(req));
    res.status(201).json({ contract });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 👁️ Preview a contract for a lead — auto-picks template, fills placeholders, no save
router.get('/preview/:leadId', requireAuth, async (req, res) => {
  try {
    const lead = await prisma.leads.findUnique({ where: { id: Number(req.params.leadId) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy

    // pick template: match event_type first, else the first template
    const tpls = await prisma.contract_templates.findMany({
      where: { vendor_id: lead.vendor_id },     // 🔒 tenancy
      orderBy: { id: 'asc' },
    });
    if (!tpls.length) return res.status(400).json({ error: 'No contract template yet. Create one in Contracts & Invoices → Contract setup.' });
    const t = tpls.find(x => x.event_type && lead.event_type && x.event_type.toLowerCase() === String(lead.event_type).toLowerCase()) || tpls[0];

    const text = [t.header, t.body, t.legal_terms].filter(Boolean).join('\n\n');
    const vendor = await prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { business_name: true } });
    const filled = await fillPlaceholders(text, lead, vendor?.business_name);
    res.json({ title: t.name, body: filled, template_name: t.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.contracts.findUnique({ where: { id }, select: { vendor_id: true, status: true } });
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && c.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    if (c.status === 'signed') return res.status(400).json({ error: 'Signed contracts cannot be deleted (audit)' });
    await prisma.contracts.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// audit trail for a contract
router.get('/:id/audit', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.contracts.findUnique({ where: { id }, select: { vendor_id: true } });
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && c.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' }); // 🔒 tenancy
    const auditRows = await prisma.contract_audit.findMany({
      where: { contract_id: id },
      orderBy: { created_at: 'asc' },
    });
    res.json({ audit: auditRows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ───────── ✍️ PUBLIC SIGNING ───────── */
router.get('/sign/:token', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token },       // the token itself is the access key
      select: {
        id: true, title: true, body: true, status: true, signed_name: true,
        signed_at: true, initials: true, viewed_at: true,
        leads: { select: { name: true } },
        vendors: { select: { business_name: true } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Contract not found' });
    if (!c.viewed_at) {
      await prisma.contracts.update({ where: { id: c.id }, data: { viewed_at: new Date() } });
      await audit(c.id, 'viewed', ipOf(req));
    }
    const { leads, vendors, ...rest } = c;
    res.json({ contract: { ...rest, client_name: leads?.name ?? null, business_name: vendors?.business_name ?? null } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// sign: typed name + drawn signature (base64) + initials array
router.post('/sign/:token', async (req, res) => {
  const { signed_name, signature_data, initials } = req.body;
  if (!signed_name || signed_name.trim().length < 2) return res.status(400).json({ error: 'Type your full name to sign' });
  if (!signature_data) return res.status(400).json({ error: 'Please draw your signature' });
  try {
    const c = await prisma.contracts.findFirst({ where: { token: req.params.token } });
    if (!c) return res.status(404).json({ error: 'Contract not found' });
    if (c.status === 'signed') return res.status(400).json({ error: 'Already signed ✅' });

    // require all [INITIAL] markers initialed
    const needed = (c.body.match(/\[INITIAL\]/g) || []).length;
    const given = Array.isArray(initials) ? initials.filter(Boolean).length : 0;
    if (needed > 0 && given < needed)
      return res.status(400).json({ error: `Please tap all ${needed} initial boxes ✍️` });

    const ip = ipOf(req);
    // 🔐 document hash: body + signer + signature + timestamp
    const stamp = new Date().toISOString();
    const docHash = crypto.createHash('sha256')
      .update(c.body + '|' + signed_name.trim() + '|' + signature_data + '|' + stamp)
      .digest('hex');
    const updated = await prisma.contracts.update({
      where: { id: c.id },
      data: {
        status: 'signed', signed_name: signed_name.trim(), signed_ip: ip,
        signature_data, initials: initials || [], doc_sha256: docHash,
        signed_at: new Date(), updated_at: new Date(),
      },
    });
    await audit(c.id, 'signed', ip, { signed_name: signed_name.trim(), sha256: docHash });
    res.json({ contract: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: GET /api/contracts/certificate/:token → signing certificate (signed only)
router.get('/certificate/:token', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token },       // the token itself is the access key
      select: {
        id: true, title: true, status: true, signed_name: true, signed_ip: true,
        signed_at: true, viewed_at: true, created_at: true, doc_sha256: true,
        signature_data: true, initials: true,
        leads: { select: { name: true, email: true, event_type: true, event_date: true } },
        vendors: { select: { business_name: true } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Contract not found' });
    if (c.status !== 'signed') return res.status(400).json({ error: 'Certificate available after signing' });
    const trail = await prisma.contract_audit.findMany({
      where: { contract_id: c.id },
      select: { event: true, ip: true, created_at: true },
      orderBy: { created_at: 'asc' },
    });
    const { leads, vendors, ...rest } = c;
    res.json({
      certificate: {
        ...rest,
        client_name: leads?.name ?? null, client_email: leads?.email ?? null,
        event_type: leads?.event_type ?? null, event_date: leads?.event_date ?? null,
        business_name: vendors?.business_name ?? null,
      },
      audit: trail,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
