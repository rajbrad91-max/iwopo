import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { moneySummary } from './payments.js';
import { notify } from './notifications.js';
import { audit, templateForLead, buildContractBody } from './contracts.js';
import { currencyFor } from '../lib/currencies.js';

const router = express.Router();

// helper: lead by client token (the token itself is the access key)
async function leadByToken(token) {
  return prisma.leads.findFirst({ where: { client_token: token } });
}

function ipOf(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '').replace('::ffff:', '');
}

/**
 * 📄 Keep the contract honest about which package it is for.
 *
 * The contract body is built with the package name and the prices baked into
 * it, so once the client picks a different package the document no longer
 * describes what they'd be agreeing to. Whenever the choice changes:
 *
 *   • a SIGNED contract for the old package is VOIDED — a signature only ever
 *     applies to what was actually signed, so it can't carry over — and a fresh
 *     one is raised for the new package
 *   • an UNSIGNED one is rebuilt in place from the same template, dropping any
 *     initials the client had tapped so far
 *
 * Best effort: a portal that can't rebuild the contract should still let the
 * client change their mind, so failures are logged rather than thrown.
 */
async function reconcileContract(lead, newPackageId, ip) {
  // A voided contract must never be treated as "the active one" — it isn't
  // one any more, and a stray match here was capable of quietly un-voiding a
  // SIGNED contract and overwriting its signature with nulls the moment
  // someone picked a package again. Excluding voided rows from "latest" is
  // what makes that impossible rather than merely unlikely.
  const latest = await prisma.contracts.findFirst({
    where: { lead_id: lead.id, status: { not: 'voided' } },      // 🔒 tenancy via the lead
    orderBy: { id: 'desc' },
  });
  // nothing stamped to compare against — always build, whether that's the
  // first contract this lead has ever had or the first since a reset voided
  // the last one
  if (latest && latest.package_id != null && Number(latest.package_id) === Number(newPackageId)) return;

  const fresh = await prisma.leads.findUnique({ where: { id: lead.id } });
  const vendor = await prisma.vendors.findUnique({
    where: { id: lead.vendor_id }, select: { business_name: true },
  });
  const tpl = await templateForLead(fresh, latest?.template_id ?? null);
  const body = tpl ? await buildContractBody(tpl, fresh, vendor?.business_name) : null;
  if (!body) return;                       // no template to build from — vendor raises one

  if (!latest) {
    // nothing active — the client's own pick raises the first one, same
    // shape as the vendor's own create path
    const created = await prisma.contracts.create({
      data: {
        vendor_id: lead.vendor_id, lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        title: tpl.name, body, status: 'sent',
        package_id: newPackageId, template_id: tpl.id,
      },
    });
    await audit(created.id, 'created', ip, { reason: 'client_picked_package' });
    return;
  }

  if (latest.status === 'signed') {
    await prisma.contracts.update({
      where: { id: latest.id },
      data: { status: 'voided', voided_at: new Date(), updated_at: new Date() },
    });
    await audit(latest.id, 'voided', ip, { reason: 'package_changed_after_signing', from: latest.package_id, to: newPackageId });
    const replacement = await prisma.contracts.create({
      data: {
        vendor_id: lead.vendor_id, lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        title: latest.title, body, status: 'sent',
        package_id: newPackageId, template_id: latest.template_id,
      },
    });
    await audit(replacement.id, 'created', ip, { reason: 'package_changed', replaces: latest.id });
    return;
  }

  await prisma.contracts.update({
    where: { id: latest.id },
    data: {
      body, package_id: newPackageId,
      initials: [], signature_data: null, signed_name: null,
      status: 'sent', viewed_at: null, updated_at: new Date(),
    },
  });
  await audit(latest.id, 'package_changed', ip, { from: latest.package_id, to: newPackageId });
}

/* 🌐 PUBLIC: GET /api/portal/:token → lead + vendor packages + money */
router.get('/:token', async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });

    /**
     * 🔄 A reopened or shared link before payment starts the flow over.
     *
     * Choosing a package, signing and paying is meant to be one sitting, not
     * three separate visits that might belong to three different people. The
     * frontend sends ?fresh=1 exactly once per browser session — the first
     * load after a tab opens, never after an action taken within it — so a
     * page refresh mid-signature does not lose anything, but a closed and
     * reopened browser, or a link opened somewhere else, does.
     *
     * A booking that has already been paid for is never touched here: this
     * only resets what is still in progress.
     */
    if (req.query.fresh === '1' && !lead.payment_claimed_at) {
      const active = await prisma.contracts.findFirst({
        where: { lead_id: lead.id, status: { not: 'voided' } },  // 🔒 tenancy via the lead
      });
      if (active) {
        await prisma.contracts.update({
          where: { id: active.id },
          data: { status: 'voided', voided_at: new Date(), updated_at: new Date() },
        });
        await audit(active.id, 'voided', ipOf(req), { reason: 'portal_reopened_before_payment' });
      }
      await prisma.lead_packages.updateMany({
        where: { lead_id: lead.id },                             // 🔒 tenancy via the lead
        data: { is_selected: false },
      });
    }
    const vendor = await prisma.vendors.findUnique({
      where: { id: lead.vendor_id },
      select: { business_name: true, logo_path: true },
    });
    // The packages this client was actually offered — their own copy, taken
    // when the vendor loaded the folder. Reading the lead's set rather than the
    // vendor's master list means the offer stays exactly as sent even if the
    // master is edited or deleted afterwards.
    const leadPkgs = await prisma.lead_packages.findMany({
      where: { lead_id: lead.id },                              // 🔒 tenancy via the lead
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });

    // Fall back to the vendor's folder for leads created before per-lead
    // packages existed, so an old link doesn't suddenly show nothing.
    let templates = [], packages = [], selectedId = lead.package_id;
    if (leadPkgs.length) {
      packages = leadPkgs.map(p => ({
        id: p.id, name: p.name, base_price: p.price,
        inclusions: p.inclusions, included_hours: null, per_hour_price: null,
      }));
      // leads.package_id has a foreign key to vendor_packages so it can't hold
      // one of these ids — the chosen one is flagged on the row instead
      selectedId = leadPkgs.find(p => p.is_selected)?.id ?? null;
    } else {
      const tplWhere = { vendor_id: lead.vendor_id };           // 🔒 tenancy
      if (lead.package_template_id) tplWhere.id = lead.package_template_id;
      templates = await prisma.package_templates.findMany({ where: tplWhere, orderBy: { id: 'asc' } });
      packages = await prisma.vendor_packages.findMany({
        where: {
          vendor_id: lead.vendor_id,                            // 🔒 tenancy
          ...(lead.package_template_id ? { template_id: lead.package_template_id } : {}),
        },
        orderBy: { base_price: 'asc' },
      });
    }
    const money = await moneySummary(lead);

    // 📄 The contract for this booking, if the vendor has raised one. The client
    // journey runs packages → contract → payment, so the portal needs to know
    // whether there's something to sign and whether they've already signed it.
    // The body comes too: the client signs it inside the portal rather than
    // being sent off to a separate page in someone else's styling.
    const contract = await prisma.contracts.findFirst({
      where: { lead_id: lead.id, status: { not: 'voided' } },    // 🔒 tenancy via the lead
      orderBy: { id: 'desc' },
      select: {
        id: true, title: true, token: true, status: true, body: true,
        initials: true, signed_at: true, signed_name: true, package_id: true,
      },
    });

    // 🎨 the vendor's branding, so the portal looks like the inquiry form the
    // client already filled in rather than a different company's page
    const brand = await prisma.inquiry_settings.findUnique({
      where: { vendor_id: lead.vendor_id },                     // 🔒 tenancy
      select: { brand_color: true, theme: true, font: true },
    });

    // 💱 resolved the same way the panel resolves it — their choice, else their
    // country — so the figure a client sees matches the one the vendor sees
    const vset = await prisma.vendor_settings.findUnique({
      where: { vendor_id: lead.vendor_id }, select: { currency: true },
    });
    const vrow = await prisma.vendors.findUnique({
      where: { id: lead.vendor_id }, select: { country: true },
    });
    const vendorCurrency = currencyFor(vset?.currency, vrow?.country);

    res.json({
      lead: {
        name: lead.name, event_type: lead.event_type, event_date: lead.event_date,
        location: lead.location,
        hours: lead.hours, package_id: selectedId, status: lead.status,
        payment_claimed_at: lead.payment_claimed_at,
      },
      business_name: vendor?.business_name,
      // the vendor's own currency, so a client in London isn't shown dollars
      currency: vendorCurrency,
      branding: {
        brand_color: brand?.brand_color || '#C9A86A',
        theme: brand?.theme || 'classic',
        font: brand?.font || 'Inter',
        logo_path: vendor?.logo_path || null,
      },
      templates, packages, money, contract,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 🌐 PUBLIC: POST /api/portal/:token/pick → client picks a package */
router.post('/:token/pick', async (req, res) => {
  const { package_id } = req.body;
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    // The id refers to one of the lead's OWN packages when it has them, and to
    // a vendor master only for old leads that predate per-lead packages.
    const own = await prisma.lead_packages.findFirst({
      where: { id: Number(package_id), lead_id: lead.id },      // 🔒 tenancy via the lead
    });
    if (own) {
      const snapshot = { name: own.name, base_price: own.price, inclusions: own.inclusions };
      await prisma.$transaction([
        // exactly one package can be the chosen one
        prisma.lead_packages.updateMany({ where: { lead_id: lead.id }, data: { is_selected: false } }),
        prisma.lead_packages.update({ where: { id: own.id }, data: { is_selected: true } }),
        prisma.leads.update({
          where: { id: lead.id },
          // package_id is left alone: it has a foreign key to vendor_packages,
          // so it can't hold a lead_packages id. The chosen one is marked with
          // is_selected above and the snapshot carries the detail.
          data: { package_snapshot: snapshot, updated_at: new Date() },
        }),
      ]);
      const updated = await prisma.leads.findUnique({ where: { id: lead.id } });
      await reconcileContract(lead, own.id, ipOf(req));
      notify(lead.vendor_id, `📦 ${lead.name || 'Client'} picked "${own.name}"`, `Lead #${lead.id}`, 'package', { type: 'lead', id: lead.id });
      return res.json({ lead: updated, money: await moneySummary(updated) });
    }

    // 🔒 legacy path: the package must belong to the lead's vendor
    const p = await prisma.vendor_packages.findFirst({
      where: {
        id: Number(package_id),
        vendor_id: lead.vendor_id,                             // 🔒 tenancy
        // and only from the folder the vendor actually sent — the portal hides
        // the others, but the id could still be posted directly
        ...(lead.package_template_id ? { template_id: lead.package_template_id } : {}),
      },
    });
    if (!p) return res.status(400).json({ error: 'Package not found' });
    const snapshot = {
      name: p.name, base_price: p.base_price, included_hours: p.included_hours,
      per_hour_price: p.per_hour_price, inclusions: p.inclusions,
    };
    const updated = await prisma.leads.update({
      where: { id: lead.id },
      data: { package_id: p.id, package_snapshot: snapshot, updated_at: new Date() },
    });
    await reconcileContract(lead, p.id, ipOf(req));
    notify(lead.vendor_id, `📦 ${lead.name || 'Client'} picked "${p.name}"`, `Lead #${lead.id}`, 'package', { type: 'lead', id: lead.id });
    res.json({ ok: true, money: await moneySummary(updated) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* 🌐 PUBLIC: POST /api/portal/:token/pay-direct
 *
 * The client says they've paid — by e-transfer, cash or card in person. This
 * doesn't record money: it raises a claim the vendor confirms once they've
 * actually seen the funds. Nothing is marked paid on a client's word alone.
 *
 * Gated on a signed contract. Hiding the button in the portal isn't enough —
 * this endpoint is public, so without the check a client could skip straight
 * past the agreement by posting to it directly.
 */
router.post('/:token/pay-direct', async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });

    const chosen = await prisma.lead_packages.findFirst({
      where: { lead_id: lead.id, is_selected: true },           // 🔒 tenancy via the lead
      select: { name: true, price: true },
    });
    if (!chosen && !lead.package_id) {
      return res.status(400).json({ error: 'Please choose a package first' });
    }

    const contract = await prisma.contracts.findFirst({
      where: { lead_id: lead.id, status: { not: 'voided' } },    // 🔒 tenancy via the lead
      orderBy: { id: 'desc' },
      select: { signed_at: true },
    });
    // A signed contract is required — no contract at all is not a free pass.
    // Voided ones are excluded above: a signature only ever covered the package
    // it was given for, so once the client switches it stops being consent to
    // anything. The portal hides the button, but this endpoint is public, so the
    // rule has to live here or a client can post straight past the agreement.
    if (!contract) {
      return res.status(409).json({ error: 'Your contract isn\u2019t ready yet — we\u2019ll email you when it is' });
    }
    if (!contract.signed_at) {
      return res.status(409).json({ error: 'Please sign your contract before arranging payment' });
    }

    await prisma.leads.update({
      where: { id: lead.id },
      data: { payment_claimed_at: new Date(), updated_at: new Date() },
    });

    const amount = chosen?.price ?? null;
    notify(
      lead.vendor_id,
      `💰 ${lead.name || 'Client'} says they've paid`,
      `${chosen?.name || 'Booking'}${amount ? ` · $${Number(amount).toFixed(0)}` : ''} · confirm when the funds arrive`,
      'payment',
      { type: 'lead', id: lead.id },   // the confirm/deny banner lives on the lead
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
