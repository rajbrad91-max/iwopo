import express from 'express';
import crypto from 'crypto';
import { query } from '../config/db.js';
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
  await query('INSERT INTO contract_audit (contract_id, event, ip, meta) VALUES ($1,$2,$3,$4)',
    [contractId, event, ip || null, meta ? JSON.stringify(meta) : null]);
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
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const { rows } = await query('SELECT * FROM contract_templates WHERE vendor_id=$1 ORDER BY id', [v]);
  res.json({ templates: rows });
});

router.post('/templates', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });
  const { name, event_type, header, body, legal_terms } = req.body;
  const { rows } = await query(
    `INSERT INTO contract_templates (vendor_id, name, event_type, header, body, legal_terms)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [v, name || 'My Contract', event_type || null, header || '', body || '', legal_terms || '']);
  res.status(201).json({ template: rows[0] });
});

router.put('/templates/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const { rows: own } = await query('SELECT vendor_id FROM contract_templates WHERE id=$1', [req.params.id]);
  if (!own[0]) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'super_admin' && own[0].vendor_id !== v) return res.status(403).json({ error: 'Forbidden' });
  const { name, event_type, header, body, legal_terms } = req.body;
  const { rows } = await query(
    `UPDATE contract_templates SET name=COALESCE($1,name), event_type=$2,
      header=COALESCE($3,header), body=COALESCE($4,body), legal_terms=COALESCE($5,legal_terms), updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [name ?? null, event_type ?? null, header ?? null, body ?? null, legal_terms ?? null, req.params.id]);
  res.json({ template: rows[0] });
});

router.delete('/templates/:id', requireAuth, async (req, res) => {
  const v = vid(req);
  const { rows: own } = await query('SELECT vendor_id FROM contract_templates WHERE id=$1', [req.params.id]);
  if (!own[0]) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'super_admin' && own[0].vendor_id !== v) return res.status(403).json({ error: 'Forbidden' });
  await query('DELETE FROM contract_templates WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ───────── 📄 CONTRACTS (vendor side) ───────── */
// all my contracts (for sidebar tab)
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v && req.user.role !== 'super_admin') return res.status(400).json({ error: 'No vendor' });
  const { rows } = v
    ? await query(
      `SELECT c.*, l.name AS client_name, l.event_type AS lead_event FROM contracts c
       JOIN leads l ON l.id=c.lead_id WHERE c.vendor_id=$1 ORDER BY c.created_at DESC`, [v])
    : await query(
      `SELECT c.*, l.name AS client_name, l.event_type AS lead_event FROM contracts c
       JOIN leads l ON l.id=c.lead_id ORDER BY c.created_at DESC`);
  res.json({ contracts: rows });
});

router.get('/lead/:leadId', requireAuth, async (req, res) => {
  const { rows: leads } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.leadId]);
  if (!leads[0]) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role !== 'super_admin' && leads[0].vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await query('SELECT * FROM contracts WHERE lead_id=$1 ORDER BY created_at DESC', [req.params.leadId]);
  res.json({ contracts: rows });
});

// create from raw text OR template (template_id) — placeholders auto-filled
router.post('/lead/:leadId', requireAuth, async (req, res) => {
  const { title, body, template_id } = req.body;
  const { rows: leads } = await query('SELECT * FROM leads WHERE id=$1', [req.params.leadId]);
  const lead = leads[0];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });

  let text = body, ctTitle = title || 'Service Agreement';
  if (template_id) {
    const { rows: t } = await query('SELECT * FROM contract_templates WHERE id=$1 AND vendor_id=$2', [template_id, lead.vendor_id]);
    if (!t[0]) return res.status(400).json({ error: 'Template not found' });
    text = [t[0].header, t[0].body, t[0].legal_terms].filter(Boolean).join('\n\n');
    ctTitle = title || t[0].name;
  }
  if (!text || !text.trim()) return res.status(400).json({ error: 'Contract text required' });

  const { rows: v } = await query('SELECT business_name FROM vendors WHERE id=$1', [lead.vendor_id]);
  const filled = await fillPlaceholders(text, lead, v[0]?.business_name);

  const token = crypto.randomBytes(24).toString('hex');
  const { rows } = await query(
    `INSERT INTO contracts (vendor_id, lead_id, token, title, body, status)
     VALUES ($1,$2,$3,$4,$5,'sent') RETURNING *`,
    [lead.vendor_id, lead.id, token, ctTitle, filled]);
  await audit(rows[0].id, 'created', ipOf(req));
  res.status(201).json({ contract: rows[0] });
});

// 👁️ Preview a contract for a lead — auto-picks template, fills placeholders, no save
router.get('/preview/:leadId', requireAuth, async (req, res) => {
  const { rows: leads } = await query('SELECT * FROM leads WHERE id=$1', [req.params.leadId]);
  const lead = leads[0];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (req.user.role !== 'super_admin' && lead.vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });

  // pick template: match event_type first, else the first template
  const { rows: tpls } = await query('SELECT * FROM contract_templates WHERE vendor_id=$1 ORDER BY id', [lead.vendor_id]);
  if (!tpls.length) return res.status(400).json({ error: 'No contract template yet. Create one in Contracts & Invoices → Contract setup.' });
  const t = tpls.find(x => x.event_type && lead.event_type && x.event_type.toLowerCase() === String(lead.event_type).toLowerCase()) || tpls[0];

  const text = [t.header, t.body, t.legal_terms].filter(Boolean).join('\n\n');
  const { rows: v } = await query('SELECT business_name FROM vendors WHERE id=$1', [lead.vendor_id]);
  const filled = await fillPlaceholders(text, lead, v[0]?.business_name);
  res.json({ title: t.name, body: filled, template_name: t.name });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT vendor_id, status FROM contracts WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'super_admin' && rows[0].vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });
  if (rows[0].status === 'signed') return res.status(400).json({ error: 'Signed contracts cannot be deleted (audit)' });
  await query('DELETE FROM contracts WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// audit trail for a contract
router.get('/:id/audit', requireAuth, async (req, res) => {
  const { rows: c } = await query('SELECT vendor_id FROM contracts WHERE id=$1', [req.params.id]);
  if (!c[0]) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'super_admin' && c[0].vendor_id !== vid(req)) return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await query('SELECT * FROM contract_audit WHERE contract_id=$1 ORDER BY created_at', [req.params.id]);
  res.json({ audit: rows });
});

/* ───────── ✍️ PUBLIC SIGNING ───────── */
router.get('/sign/:token', async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.title, c.body, c.status, c.signed_name, c.signed_at, c.initials, c.viewed_at,
            l.name AS client_name, v.business_name
     FROM contracts c JOIN leads l ON l.id=c.lead_id JOIN vendors v ON v.id=c.vendor_id
     WHERE c.token=$1`, [req.params.token]);
  if (!rows[0]) return res.status(404).json({ error: 'Contract not found' });
  if (!rows[0].viewed_at) {
    await query('UPDATE contracts SET viewed_at=NOW() WHERE id=$1', [rows[0].id]);
    await audit(rows[0].id, 'viewed', ipOf(req));
  }
  res.json({ contract: rows[0] });
});

// sign: typed name + drawn signature (base64) + initials array
router.post('/sign/:token', async (req, res) => {
  const { signed_name, signature_data, initials } = req.body;
  if (!signed_name || signed_name.trim().length < 2) return res.status(400).json({ error: 'Type your full name to sign' });
  if (!signature_data) return res.status(400).json({ error: 'Please draw your signature' });
  const { rows } = await query('SELECT * FROM contracts WHERE token=$1', [req.params.token]);
  const c = rows[0];
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
  const { rows: upd } = await query(
    `UPDATE contracts SET status='signed', signed_name=$1, signed_ip=$2, signature_data=$3,
      initials=$4, doc_sha256=$5, signed_at=NOW(), updated_at=NOW() WHERE id=$6 RETURNING *`,
    [signed_name.trim(), ip, signature_data, JSON.stringify(initials || []), docHash, c.id]);
  await audit(c.id, 'signed', ip, { signed_name: signed_name.trim(), sha256: docHash });
  res.json({ contract: upd[0] });
});

// PUBLIC: GET /api/contracts/certificate/:token → signing certificate (signed only)
router.get('/certificate/:token', async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.title, c.status, c.signed_name, c.signed_ip, c.signed_at, c.viewed_at,
            c.created_at, c.doc_sha256, c.signature_data, c.initials,
            l.name AS client_name, l.email AS client_email, l.event_type, l.event_date,
            v.business_name
     FROM contracts c JOIN leads l ON l.id=c.lead_id JOIN vendors v ON v.id=c.vendor_id
     WHERE c.token=$1`, [req.params.token]);
  if (!rows[0]) return res.status(404).json({ error: 'Contract not found' });
  if (rows[0].status !== 'signed') return res.status(400).json({ error: 'Certificate available after signing' });
  const { rows: trail } = await query(
    'SELECT event, ip, created_at FROM contract_audit WHERE contract_id=$1 ORDER BY created_at', [rows[0].id]);
  res.json({ certificate: rows[0], audit: trail });
});

export default router;
