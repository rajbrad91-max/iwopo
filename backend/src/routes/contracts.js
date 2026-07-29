import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary } from './payments.js';
import { currencyFor } from '../lib/currencies.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}
function ipOf(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '').replace('::ffff:', '');
}
export async function audit(contractId, event, ip, meta) {
  await prisma.contract_audit.create({
    data: { contract_id: contractId, event, ip: ip || null, meta: meta ?? null },
  });
}

/**
 * 📄 Pick the contract template for a lead: prefer one whose event_type matches,
 * otherwise the vendor's first. Shared by preview, creation and the portal's
 * regeneration path so all three draw from the same template.
 */
export async function templateForLead(lead, templateId = null) {
  if (templateId) {
    return prisma.contract_templates.findFirst({
      where: { id: Number(templateId), vendor_id: lead.vendor_id },   // 🔒 tenancy
    });
  }
  const tpls = await prisma.contract_templates.findMany({
    where: { vendor_id: lead.vendor_id },                             // 🔒 tenancy
    orderBy: { id: 'asc' },
  });
  if (!tpls.length) return null;
  return tpls.find(x => x.event_type && lead.event_type
    && x.event_type.toLowerCase() === String(lead.event_type).toLowerCase()) || tpls[0];
}

/** Only what a section may hold, each trimmed to what the page can show. */
function cleanSections(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map((x, i) => ({
    id: String(x.id || `s${i + 1}`).slice(0, 24),
    title: String(x.title || '').trim().slice(0, 120),
    text: String(x.text || '').slice(0, 8000),
    initial: !!x.initial,
  })).filter(x => x.title || x.text);
}

/**
 * The template joined into one body, ready for placeholder fill.
 *
 * A template is a list of titled sections — each policy in its own block — so a
 * vendor can see and edit one term at a time instead of scrolling one long
 * field. A section marked for initials gets an [INITIAL] box after its text,
 * which is what makes the client acknowledge that clause specifically.
 *
 * Templates written before sections existed still carry their whole contract in
 * `body`, so that is used when there are no sections. Nothing has to be migrated
 * for an old template to keep working.
 */
export function templateText(t) {
  const sections = Array.isArray(t.sections) ? t.sections : [];
  const middle = sections.length
    ? sections
        .filter(x => (x.title || '').trim() || (x.text || '').trim())
        .map(x => [
          (x.title || '').trim(),
          (x.text || '').trim(),
          x.initial ? '[INITIAL]' : '',
        ].filter(Boolean).join('\n\n'))
        .join('\n\n')
    : (t.body || '');
  return [t.header, middle, t.legal_terms].filter(Boolean).join('\n\n');
}

// 🔤 Fill placeholders from lead + package + money
export async function fillPlaceholders(text, lead, businessName) {
  const money = await moneySummary(lead);

  /**
   * 💱 The vendor's own currency, resolved the way every other screen resolves
   * it. These three were hard-coded to a dollar sign when currency support went
   * in — so a vendor in London had their client agree, in writing, to a figure
   * in the wrong currency. A contract is the last place that should be guessed.
   */
  const vset = await prisma.vendor_settings.findUnique({
    where: { vendor_id: lead.vendor_id },        // 🔒 the lead's owner, from the row
    select: { currency: true },
  });
  const vrow = await prisma.vendors.findUnique({
    where: { id: lead.vendor_id }, select: { country: true },
  });
  const code = currencyFor(vset?.currency, vrow?.country);
  const cash = (v) => {
    const num = Number(v || 0);
    try {
      return num.toLocaleString('en', {
        style: 'currency', currency: code,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      });
    } catch { return `${num} ${code}`; }
  };
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
    // final_total already has the discount taken off — moneySummary applies it
    '{{total_cost}}': cash(money.final_total),
    '{{deposit}}': cash(money.deposit_amount),
    /**
     * 💡 On a contract this means what is left AFTER the deposit, not what is
     * outstanding today.
     *
     * Nothing has been paid when a contract is written, so the panel's balance
     * — total minus payments — printed the FULL total immediately after a
     * sentence naming the deposit, reading as though the client owed both. The
     * payment card keeps its own meaning, which is right for a running account;
     * a document being signed needs this one.
     */
    '{{balance}}': cash(Math.max(money.final_total - money.deposit_amount, 0)),
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
    const { name, event_type, header, body, legal_terms, sections } = req.body;
    const template = await prisma.contract_templates.create({
      data: {
        vendor_id: Number(v),                   // 🔒 tenancy
        name: name || 'My Contract',
        event_type: event_type || null,
        header: header || '', body: body || '', legal_terms: legal_terms || '',
        sections: cleanSections(sections),
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
    const { name, event_type, header, body, legal_terms, sections } = req.body;
    // COALESCE($n, col): only overwrite what was supplied (event_type is always set)
    const data = { event_type: event_type ?? null, updated_at: new Date() };
    if (name !== undefined && name !== null) data.name = name;
    if (header !== undefined && header !== null) data.header = header;
    if (body !== undefined && body !== null) data.body = body;
    if (legal_terms !== undefined && legal_terms !== null) data.legal_terms = legal_terms;
    if (sections !== undefined) data.sections = cleanSections(sections);
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
      // Voided contracts are history, not work in progress. They pile up on any
      // lead that changed package, and the vendor's list should show what's
      // live, not every superseded draft. They remain in the database and the
      // audit trail records why each was voided.
      where: v
        ? { vendor_id: Number(v), status: { not: 'voided' } }   // 🔒 tenancy (super_admin may span vendors)
        : { status: { not: 'voided' } },
      orderBy: { created_at: 'desc' },
      include: { leads: { select: { name: true, event_type: true, status: true } } },
    });
    const contracts = rows.map(({ leads, ...c }) => ({
      ...c, client_name: leads?.name ?? null, lead_event: leads?.event_type ?? null,
      lead_status: leads?.status ?? null,
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
      // same rule as the overview: a superseded contract isn't something the
      // vendor acts on. The lead keeps only its live one.
      where: { lead_id: leadId, status: { not: 'voided' } },
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

    let text = body, ctTitle = title || 'Service Agreement', tplId = null;
    if (template_id) {
      const t = await templateForLead(lead, template_id);
      if (!t) return res.status(400).json({ error: 'Template not found' });
      text = templateText(t);
      ctTitle = title || t.name;
      tplId = t.id;
    }
    if (!text || !text.trim()) return res.status(400).json({ error: 'Contract text required' });

    const vendor = await prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { business_name: true } });
    const filled = await fillPlaceholders(text, lead, vendor?.business_name);

    // 🔓 A vendor who turned auto-release on has said they don't want the review
    // step; their contracts are approved the moment they're built.
    const vset = await prisma.vendor_settings.findUnique({
      where: { vendor_id: lead.vendor_id },          // 🔒 the lead's owner, from the row
      select: { auto_release_contract: true },
    });
    const autoRelease = !!vset?.auto_release_contract;

    // Which package this contract was drawn for. The body carries the package
    // name and the prices, so if the client later picks a different one the
    // contract no longer describes what they're agreeing to — the portal uses
    // this to spot that and rebuild it. Kept FK-free because it can hold either
    // a lead_packages id or, for older leads, a vendor_packages one.
    const chosen = await prisma.lead_packages.findFirst({
      where: { lead_id: lead.id, is_selected: true },                  // 🔒 tenancy via the lead
      select: { id: true },
    });

    const contract = await prisma.contracts.create({
      data: {
        vendor_id: lead.vendor_id,             // 🔒 stamped from the owning lead
        lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        title: ctTitle, body: filled, status: 'sent',
        // 🔒 built but not yet approved for sending. auto-release stamps it now
        // so a vendor who opted out of the review step is never held up by it.
        released_at: autoRelease ? new Date() : null,
        package_id: chosen?.id ?? lead.package_id ?? null,
        template_id: tplId,
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

    const t = await templateForLead(lead);
    if (!t) return res.status(400).json({ error: 'No contract template yet. Create one in Contracts & Invoices → Contract setup.' });

    const text = templateText(t);
    const vendor = await prisma.vendors.findUnique({
      where: { id: lead.vendor_id },
      select: { business_name: true, logo_path: true },
    });
    const filled = await fillPlaceholders(text, lead, vendor?.business_name);

    /**
     * The preview renders through the same component the client signs on, so it
     * has to be handed the same shape. Returning only the title and body left
     * the heading reading "· for" with the names missing — a preview that is
     * "exactly what your client sees" has to actually be that, or it teaches the
     * vendor to trust something that isn't true.
     *
     * The live contract's id and release state come too, so the Release button
     * has something to act on and can say when it was already approved.
     */
    const existing = await prisma.contracts.findFirst({
      where: { lead_id: lead.id, voided_at: null },
      orderBy: { id: 'desc' },
      select: { id: true, released_at: true, status: true },
    });

    res.json({
      contract: {
        id: existing?.id || null,
        title: t.name,
        body: filled,
        template_name: t.name,
        business_name: vendor?.business_name || null,
        client_name: lead.name || null,
        logo_path: vendor?.logo_path || null,
        released_at: existing?.released_at || null,
        status: existing?.status || 'draft',
      },
    });
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
        vendors: { select: { business_name: true, logo_path: true } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Contract not found' });
    if (!c.viewed_at) {
      await prisma.contracts.update({ where: { id: c.id }, data: { viewed_at: new Date() } });
      await audit(c.id, 'viewed', ipOf(req));
    }
    const { leads, vendors, ...rest } = c;
    res.json({ contract: { ...rest, client_name: leads?.name ?? null, business_name: vendors?.business_name ?? null, logo_path: vendors?.logo_path ?? null } });
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

/**
 * 📥 PUBLIC: download the signed contract, or its certificate, as a file.
 *
 * A vendor needs to keep, email or file these away from the panel — an insurer,
 * an accountant or a court is not going to be handed a link. The token is the
 * access key, exactly as on the view routes, so a client can keep their own copy
 * without an account.
 *
 * These are self-contained HTML documents: every style is inline and the
 * signature travels as its embedded data URL, so the file still renders years
 * later on a machine that has never heard of iwopo. Opening one and printing to
 * PDF produces the archival copy. Generating PDFs server-side would need a PDF
 * library added, which is a bigger decision than this route.
 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const DOC_CSS = `
  body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;background:#fff;
       max-width:760px;margin:40px auto;padding:0 32px;line-height:1.75;font-size:15px}
  .hd{text-align:center;border-bottom:2px solid #222;padding-bottom:18px;margin-bottom:28px}
  .hd img{max-height:56px;max-width:180px;object-fit:contain;margin-bottom:10px}
  .biz{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#666;margin:0}
  h1{font-size:24px;margin:8px 0 0}
  .body{white-space:pre-wrap}
  .sig{margin-top:36px;border-top:1px solid #ccc;padding-top:22px}
  .sig img{max-height:90px;display:block;margin-bottom:6px}
  .meta{font-size:12.5px;color:#555;line-height:1.9}
  .meta b{color:#1a1a1a}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-family:system-ui,sans-serif;font-size:13.5px}
  th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e3e3e3;vertical-align:top}
  th{width:34%;color:#555;font-weight:600}
  .fine{margin-top:34px;font-size:11.5px;color:#777;border-top:1px solid #e3e3e3;padding-top:12px;
        font-family:system-ui,sans-serif;line-height:1.7}
`;

/**
 * Serve one of these documents as a page rather than a forced download.
 *
 * Downloading straight from a list is a guess: you get a file on disk before
 * you have seen whether it is the right one. It opens in a tab instead, and
 * carries its own Save button — which prints, so the vendor gets a PDF through
 * the browser's own dialogue and can pick the folder and the name.
 *
 * The bar is hidden in print, so it never appears in the saved copy.
 */
const DOC_ACTIONS = `
  <div class="doc-actions">
    <button type="button" onclick="window.print()">🖨️ Save as PDF / Print</button>
  </div>
  <style>
    .doc-actions{position:sticky;top:0;background:#fff;padding:14px 0 16px;margin:-40px 0 18px;
      border-bottom:1px solid #e3e3e3;text-align:right;font-family:system-ui,sans-serif}
    .doc-actions button{padding:9px 18px;border:1px solid #222;border-radius:8px;background:#1a1a1a;
      color:#fff;font-size:13.5px;font-weight:600;cursor:pointer}
    .doc-actions button:hover{background:#000}
    @media print{.doc-actions{display:none}}
  </style>
`;

function sendDoc(res, filename, title, inner) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>${DOC_ACTIONS}${inner}</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // inline, not attachment: read it first, save it if you want it
  res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  res.send(html);
}

// PUBLIC: GET /api/contracts/download/:token → the signed agreement as a file
router.get('/download/:token', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token, status: 'signed' },   // token is the access key
      include: {
        leads: { select: { name: true } },
        vendors: { select: { business_name: true, logo_path: true } },
      },
    });
    if (!c) return res.status(404).send('Signed contract not found');

    // the initial boxes are replaced with what the client actually initialled
    const initials = (c.signed_name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase();
    const body = esc(c.body).split('[INITIAL]')
      .join(`<span style="border-bottom:1px solid #333;padding:0 12px;font-family:cursive">${esc(initials)}</span>`);

    const logo = c.vendors?.logo_path
      ? `<img src="${req.protocol}://${req.get('host')}/api/me/logo/${esc(c.vendors.logo_path)}" alt="">` : '';

    sendDoc(res, `contract-${c.leads?.name || c.id}-${String(c.signed_at).slice(0, 10)}.html`, c.title, `
      <div class="hd">${logo}<p class="biz">${esc(c.vendors?.business_name || '')}</p><h1>${esc(c.title)}</h1></div>
      <div class="body">${body}</div>
      <div class="sig">
        ${c.signature_data ? `<img src="${esc(c.signature_data)}" alt="Signature">` : ''}
        <p class="meta">
          <b>Signed by:</b> ${esc(c.signed_name || '—')}<br>
          <b>Date:</b> ${c.signed_at ? new Date(c.signed_at).toUTCString() : '—'}<br>
          <b>IP address:</b> ${esc(c.signed_ip || '—')}<br>
          <b>Document fingerprint (SHA-256):</b> ${esc(c.doc_sha256 || '—')}
        </p>
      </div>
      <p class="fine">Downloaded ${new Date().toUTCString()}. Keep this copy for your own records.</p>
    `);
  } catch (e) { res.status(500).send(e.message); }
});

// PUBLIC: GET /api/contracts/certificate/:token/download → certificate as a file
router.get('/certificate/:token/download', async (req, res) => {
  try {
    const c = await prisma.contracts.findFirst({
      where: { token: req.params.token, status: 'signed' },
      include: {
        leads: { select: { name: true, email: true, event_type: true, event_date: true } },
        vendors: { select: { business_name: true, logo_path: true } },
      },
    });
    if (!c) return res.status(404).send('Certificate not found');

    const trail = await prisma.contract_audit.findMany({
      where: { contract_id: c.id },
      select: { event: true, ip: true, created_at: true },
      orderBy: { created_at: 'asc' },
    });
    // every time here is UTC and says so: a record that reads differently
    // depending on who opens it is worth nothing in a dispute
    const utc = (d) => (d ? new Date(d).toUTCString() : '—');
    const rows = [
      ['Document', c.title], ['Client', c.leads?.name], ['Client email', c.leads?.email],
      ['Event', c.leads?.event_type], ['Signed by', c.signed_name],
      ['Signed at', utc(c.signed_at)], ['First viewed', utc(c.viewed_at)],
      ['Created', utc(c.created_at)], ['Signer IP', c.signed_ip],
      ['Fingerprint (SHA-256)', c.doc_sha256],
    ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`).join('');

    const audit = trail.map(t =>
      `<tr><th>${esc(t.event)}</th><td>${utc(t.created_at)}${t.ip ? ` · ${esc(t.ip)}` : ''}</td></tr>`).join('');

    const logo = c.vendors?.logo_path
      ? `<img src="${req.protocol}://${req.get('host')}/api/me/logo/${esc(c.vendors.logo_path)}" alt="">` : '';

    sendDoc(res, `certificate-${c.leads?.name || c.id}.html`, 'Certificate of Completion', `
      <div class="hd">${logo}<p class="biz">${esc(c.vendors?.business_name || '')}</p>
        <h1>Certificate of Completion</h1>
        <p class="meta">Reference ${esc(String(req.params.token).slice(0, 16).toUpperCase())}</p></div>
      <table>${rows}</table>
      ${c.signature_data ? `<div class="sig"><img src="${esc(c.signature_data)}" alt="Signature"><p class="meta"><b>${esc(c.signed_name || '')}</b></p></div>` : ''}
      <h2 style="font-size:16px;margin-top:30px">Audit trail</h2>
      <table>${audit || '<tr><td>No events recorded</td></tr>'}</table>
      <p class="fine">All times shown in UTC. Downloaded ${new Date().toUTCString()}.
      Keep this copy for your own records.</p>
    `);
  } catch (e) { res.status(500).send(e.message); }
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
        vendors: { select: { business_name: true, logo_path: true } },
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
        logo_path: vendors?.logo_path ?? null,
      },
      audit: trail,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * PUT /api/contracts/:id/release → the vendor has read it and it may go out.
 *
 * Separate from previewing on purpose: opening a document is not the same as
 * approving it, and a step that completes by accident is not a review. Releasing
 * is recorded rather than toggled, so "when was this approved" has an answer.
 */
router.put('/:id/release', requireAuth, async (req, res) => {
  const v = req.user.vendor_id;
  const id = Number(req.params.id);
  try {
    const ct = await prisma.contracts.findUnique({
      where: { id }, select: { vendor_id: true, released_at: true, voided_at: true },
    });
    if (!ct) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && ct.vendor_id !== v) {
      return res.status(403).json({ error: 'Forbidden' });          // 🔒 tenancy
    }
    if (ct.voided_at) return res.status(409).json({ error: 'This contract was voided' });
    // releasing twice is not an error — it just keeps the first approval time
    const updated = ct.released_at
      ? await prisma.contracts.findUnique({ where: { id } })
      : await prisma.contracts.update({ where: { id }, data: { released_at: new Date() } });
    res.json({ contract: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
