import express from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { moneySummary } from './payments.js';
import { notify } from './notifications.js';
import { audit, templateForLead, builtFromId, buildContractBody, upgradeDeliverables } from './contracts.js';
import { currencyFor } from '../lib/currencies.js';
import { gateValue, gatePassed, cookieOf } from '../lib/gateCookie.js';
import { limit } from '../middleware/rateLimit.js';
import { ownDomainAllowed } from '../lib/vendorHosts.js';
import { clientIp } from '../lib/clientIp.js';
import { serverError } from '../lib/httpError.js';
import { getFeatures } from '../lib/entitlements.js';
import { accountOf, connectReady, cardCheckout } from '../lib/stripeConnect.js';
import { quotePackage, publicExtra, extraQty } from '../lib/packageQuote.js';

const router = express.Router();

// helper: lead by client token (the token itself is the access key)
async function leadByToken(token) {
  return prisma.leads.findFirst({ where: { client_token: token } });
}

/* 🔒 Has this caller passed the lead's Secure Login (email check)?
   An HMAC tied to the lead and the email on file — the old plain "1" could be
   typed into devtools, and lead ids are small sequential numbers. A lead with
   the gate switched off is always open. */
function gateOpen(req, lead) {
  if (!lead.gateway_enabled) return true;
  return gatePassed(cookieOf(req, 'pkg_verified_' + lead.id), 'pkg', lead.id,
    String(lead.email || '').trim().toLowerCase());
}

/* 🔄 Start the client's choice over: no package picked and none of the optional extras ticked.
   Extras the VENDOR added or included stay exactly as the vendor set them. */
async function clearChoice(leadId) {
  const rows = await prisma.lead_packages.findMany({
    where: { lead_id: leadId },                                   // 🔒 tenancy via the lead
    select: { id: true, extras: true },
  });
  await prisma.$transaction([
    prisma.lead_packages.updateMany({ where: { lead_id: leadId }, data: { is_selected: false } }),
    ...rows
      .filter(r => Array.isArray(r.extras) && r.extras.some(x => x?.chosen))
      .map(r => prisma.lead_packages.update({
        where: { id: r.id },
        data: { extras: r.extras.map(x => (x?.chosen ? { ...x, chosen: false } : x)) },
      })),
  ]);
}

/* The client's ticks, checked against the package's own list: only extras the vendor offered as optional, with a
   quantity inside the vendor's limit. Anything else posted is ignored — the price is never the client's to set. */
function applyPicks(extras, picks) {
  const want = new Map();
  for (const p of Array.isArray(picks) ? picks : []) {
    if (p && typeof p.id === 'string') want.set(p.id, p.qty);
  }
  return (Array.isArray(extras) ? extras : []).map(x => {
    if (!x || x.mode !== 'optional') return x;
    if (!want.has(x.id)) return { ...x, chosen: false };
    const qty = extraQty({ ...x, qty: want.get(x.id) }, null);
    return { ...x, chosen: true, qty: x.unit === 'per_item' || x.unit === 'per_hour' ? qty : 1 };
  });
}

/* the client's own choices on one package, for "did anything change?" */
const picksKey = (extras) => (Array.isArray(extras) ? extras : [])
  .filter(x => x?.mode === 'optional' && x.chosen)
  .map(x => `${x.id}:${x.qty || 1}`).sort().join(',');



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
async function reconcileContract(lead, newPackageId, ip, { extrasChanged = false } = {}) {
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
  // same package but different extras is a different agreement too — the contract lists them and their prices
  if (!extrasChanged && latest && latest.package_id != null && Number(latest.package_id) === Number(newPackageId)) return;
  const why = extrasChanged && latest && Number(latest.package_id) === Number(newPackageId) ? 'extras' : 'package';

  const fresh = await prisma.leads.findUnique({ where: { id: lead.id } });
  const vendor = await prisma.vendors.findUnique({
    where: { id: lead.vendor_id }, select: { business_name: true },
  });
  /* The lead's most recent contract — even one a portal reset voided — says which template the vendor chose for
     this lead and whether they had already approved (released) it. Both carry over to the rebuilt contract:
     before 2026-10-30 the rebuild fell back to the default template and waited for a second Release nobody knew
     about, so the client sat on "On its way" for ever (Muse end-to-end test, B2/B3). */
  const prev = latest || await prisma.contracts.findFirst({
    where: { lead_id: lead.id },                                  // 🔒 tenancy via the lead
    orderBy: { id: 'desc' },
    select: { template_id: true, released_at: true },
  });
  const approved = !!prev?.released_at;
  const tpl = await templateForLead(fresh, prev?.template_id ?? null);
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
        package_id: newPackageId, template_id: builtFromId(tpl),
        ...(approved ? { released_at: new Date() } : {}),   // the vendor already approved this lead's contract
      },
    });
    await audit(created.id, 'created', ip, { reason: 'client_picked_package', released: approved });
    return;
  }

  if (latest.status === 'signed') {
    await prisma.contracts.update({
      where: { id: latest.id },
      data: { status: 'voided', voided_at: new Date(), updated_at: new Date() },
    });
    await audit(latest.id, 'voided', ip, { reason: `${why}_changed_after_signing`, from: latest.package_id, to: newPackageId });
    /* R4 (2026-10-30): a claimed payment belonged to the cancelled contract; the vendor hears what happened */
    await prisma.leads.update({ where: { id: lead.id }, data: { payment_claimed_at: null, updated_at: new Date() } });
    notify(lead.vendor_id, `🔁 ${lead.name || 'Client'} changed ${why === 'extras' ? 'their extras' : 'package'} after signing`, `The signed contract was cancelled — a new one for the new ${why === 'extras' ? 'choice' : 'package'} is waiting for their signature`, 'contract', { type: 'lead', id: lead.id });
    const replacement = await prisma.contracts.create({
      data: {
        vendor_id: lead.vendor_id, lead_id: lead.id,
        token: crypto.randomBytes(24).toString('hex'),
        title: latest.title, body, status: 'sent',
        package_id: newPackageId, template_id: latest.template_id,
        ...(approved ? { released_at: new Date() } : {}),   // same template the vendor approved
      },
    });
    await audit(replacement.id, 'created', ip, { reason: `${why}_changed`, replaces: latest.id });
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
  await audit(latest.id, `${why}_changed`, ip, { from: latest.package_id, to: newPackageId });
}

/* 🌐 PUBLIC: GET /api/portal/:token → lead + vendor packages + money */
router.get('/:token', async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });

    const vendor = await prisma.vendors.findUnique({
      where: { id: lead.vendor_id },
      select: { business_name: true, logo_path: true },
    });
    // 🎨 the vendor's branding, so the portal looks like the inquiry form the
    // client already filled in rather than a different company's page
    const brand = await prisma.inquiry_settings.findUnique({
      where: { vendor_id: lead.vendor_id },                     // 🔒 tenancy
      select: { brand_color: true, theme: true, font: true },
    });

    /**
     * 🔒 Secure Login — an email check before anything on the booking shows.
     *
     * ⚠️ FIRST, before anything below reads or CHANGES the booking. The
     * ?fresh=1 reset used to run above this check, so somebody who had the
     * link but had not passed the email check could still void the contract
     * just by opening it.
     */
    if (!gateOpen(req, lead)) {
      return res.json({
        gated: true,
        business_name: vendor?.business_name,
        white_label: await ownDomainAllowed(lead.vendor_id),
        lead: { name: lead.name },
        branding: {
          brand_color: brand?.brand_color || '#C9A86A',
          theme: brand?.theme || 'classic', font: brand?.font || 'Inter',
          logo_path: vendor?.logo_path || null,
        },
      });
    }

    /**
     * 🔄 A reopened or shared link before payment starts the flow over.
     *
     * The frontend sends ?fresh=1 exactly once per browser session, so a
     * refresh mid-signature loses nothing, but a reopened browser does.
     *
     * ⚠️ A SIGNED contract is never voided here. It is an executed agreement;
     * throwing one away because the client closed their browser before paying
     * destroyed the signature with nothing to show why. Only work still in
     * progress — an unsigned contract and an unconfirmed package choice — is
     * reset. Changing package after signing is still handled, deliberately,
     * by reconcileContract when the client actually picks a different one.
     */
    if (req.query.fresh === '1' && !lead.payment_claimed_at) {
      const active = await prisma.contracts.findFirst({
        where: { lead_id: lead.id, status: { not: 'voided' } },  // 🔒 tenancy via the lead
        orderBy: { id: 'desc' },
        select: { id: true, signed_at: true },
      });
      if (!active?.signed_at) {
        if (active) {
          await prisma.contracts.update({
            where: { id: active.id },
            data: { status: 'voided', voided_at: new Date(), updated_at: new Date() },
          });
          await audit(active.id, 'voided', clientIp(req), { reason: 'portal_reopened_before_payment' });
        }
        await clearChoice(lead.id);
      }
    }
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
      /* 📦 each package priced for this client (lib/packageQuote.js) and its extras as the client may see them —
         'off' ones never leave the server, nor do the vendor's own notes */
      packages = leadPkgs.map(p => ({
        id: p.id, name: p.name, base_price: p.price, description: p.description || '', badge: p.badge,
        inclusions: p.inclusions, price_mode: p.price_mode, min_guests: p.min_guests,
        included_hours: p.included_hours, per_hour_price: p.per_hour_price, auto_extra_hours: p.auto_extra_hours,
        tax_mode: p.tax_mode, tax_rate: p.tax_rate,   // 🧾 "Includes 5% tax" / "Plus tax" / nothing
        extras: (Array.isArray(p.extras) ? p.extras : []).filter(x => x && x.mode !== 'off').map(x => publicExtra(x, lead)),
        quote: quotePackage(p, lead),
      }));
      // leads.package_id has a foreign key to vendor_packages so it can't hold
      // one of these ids — the chosen one is flagged on the row instead
      selectedId = leadPkgs.find(p => p.is_selected)?.id ?? null;
    } else if (lead.package_template_id) {
      // an older lead: the ONE folder it was given. A lead with no folder shows nothing — before 2026-10-28 it
      // fell back to every package the vendor had, from every folder, packages this client was never sent
      const tplWhere = { vendor_id: lead.vendor_id, id: lead.package_template_id };   // 🔒 tenancy
      templates = await prisma.package_templates.findMany({ where: tplWhere, orderBy: { id: 'asc' } });
      packages = await prisma.vendor_packages.findMany({
        where: {
          vendor_id: lead.vendor_id,                            // 🔒 tenancy
          template_id: lead.package_template_id,
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
    const contractRow = await prisma.contracts.findFirst({
      where: { lead_id: lead.id, status: { not: 'voided' } },    // 🔒 tenancy via the lead
      orderBy: { id: 'desc' },
      select: {
        id: true, title: true, token: true, status: true, body: true,
        initials: true, signed_at: true, signed_name: true, package_id: true,
        released_at: true,
      },
    });
    /**
     * 🔒 An unreleased contract is treated as not there yet.
     *
     * The alternative — showing it and refusing the signature at the last step —
     * is worse than showing nothing: the client reads the terms, decides to
     * accept them, and is then told no. A contract already signed is still
     * returned regardless, so a signed client never loses sight of what they
     * agreed to just because of a later flag change.
     */
    const contract = (contractRow && !contractRow.released_at && !contractRow.signed_at)
      ? null
      : contractRow;
    if (contract?.body) contract.body = upgradeDeliverables(contract.body);

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
      // 🎉 can this vendor take the booking here (contracts in their plan)? Free: the pick becomes a request (Raj, 2026-11-06)
      books: (await getFeatures(lead.vendor_id)).has('contracts'),
      card_pay: !!(await accountOf(lead.vendor_id)) && await connectReady(),   // 💳 the vendor's own Stripe is connected
      // 💲 the vendor set this booking's price by hand — the page shows that figure, not one worked out from the package
      custom_price: lead.price_override != null,
      lead: {
        name: lead.name, event_type: lead.event_type, event_date: lead.event_date,
        location: lead.location,
        hours: lead.hours, guests: lead.guests, timing_from: lead.timing_from, timing_to: lead.timing_to,
        package_id: selectedId, status: lead.status,
        payment_claimed_at: lead.payment_claimed_at,
        // ⏳ the countdown a vendor turns on around a limited-time offer
        timer_enabled: lead.timer_enabled, timer_hours: lead.timer_hours,
        timer_started_at: lead.timer_started_at, created_at: lead.created_at,
      },
      business_name: vendor?.business_name,
      white_label: await ownDomainAllowed(lead.vendor_id),
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
  } catch (e) { serverError(res, e); }
});

/**
 * 🔓 PUBLIC: POST /api/portal/:token/verify — the email check itself.
 *
 * A plain, case-insensitive match against the email already on file for
 * this booking. Not a password — the client never set one — just the one
 * fact tying "whoever has this link" to "the person this booking is for".
 */
router.post('/:token/verify',
  // an email is guessable in a way a password is not — throttle the guessing
  limit({ name: 'portal-verify', max: 12, windowMs: 15 * 60_000, key: r => r.params.token }),
  async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    const given = String(req.body?.email || '').trim().toLowerCase();
    const onFile = String(lead.email || '').trim().toLowerCase();
    if (!given) return res.status(400).json({ error: 'Enter your email address' });
    if (!onFile || given !== onFile) {
      return res.status(403).json({ error: "That email doesn't match our records" });
    }
    /* signed, and httpOnly — nothing on the page reads it, and a value a
       script can see is a value a script can copy */
    res.cookie('pkg_verified_' + lead.id, gateValue('pkg', lead.id, onFile), {
      maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: true, secure: true,
    });
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

/* 🎉 The catch on the Free plan (Raj, 2026-11-06): when a client picks a package from a vendor whose plan has no contracts,
   no contract is prepared — the vendor is told the client wants to book and that Essential sends the contract and takes
   the deposit; the client is told the vendor will be in touch to confirm. The moment money is near is the moment to upgrade. */
async function afterPick(lead, packageId, packageName, req, { extrasChanged = false, changed = true } = {}) {
  if ((await getFeatures(lead.vendor_id)).has('contracts')) {
    await reconcileContract(lead, packageId, clientIp(req), { extrasChanged });
    // the same choice confirmed again (a Continue tap with nothing changed) is not news to the vendor
    if (changed) notify(lead.vendor_id, `📦 ${lead.name || 'Client'} picked "${packageName}"`, `Lead #${lead.id}`, 'package', { type: 'lead', id: lead.id });
    return true;
  }
  if (!changed) return false;
  notify(lead.vendor_id, `🎉 ${lead.name || 'A client'} wants to book "${packageName}"!`,
    'Upgrade to Essential to send the contract and take the deposit.', 'package', { type: 'lead', id: lead.id });
  return false;
}

/* 🌐 PUBLIC: POST /api/portal/:token/pick → client picks a package
   body: { package_id, extras?: [{ id, qty }] } — the optional extras the client ticked on THAT package */
router.post('/:token/pick', limit({ name: 'portal-pick', max: 60, windowMs: 60 * 60_000, key: (r) => r.params.token }), async (req, res) => {
  const { package_id } = req.body || {};
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    /* 🔒 the Secure Login applies to changing the booking, not only to
       reading it — this route is public and can be posted to directly */
    if (!gateOpen(req, lead)) return res.status(403).json({ error: 'Please confirm your email first' });
    // The id refers to one of the lead's OWN packages when it has them, and to
    // a vendor master only for old leads that predate per-lead packages.
    const own = await prisma.lead_packages.findFirst({
      where: { id: Number(package_id), lead_id: lead.id },      // 🔒 tenancy via the lead
    });
    if (own) {
      // the client's ticks on this package, checked against what the vendor offered
      const extras = applyPicks(own.extras, req.body?.extras);
      const extrasChanged = picksKey(extras) !== picksKey(own.extras);
      const changed = !own.is_selected || extrasChanged;
      const q = quotePackage({ ...own, extras }, lead);
      // a record of the moment: what was picked and what it came to
      const snapshot = {
        name: own.name, base_price: own.price, inclusions: own.inclusions,
        extra_hours: q.extra_hours, extra_hours_amount: q.extra_hours_amount,
        extras: q.extras.map(l => ({ name: l.name, qty: l.qty, amount: l.amount })),
        total: q.total, picked_at: new Date().toISOString(),
      };
      // the OTHER packages lose any ticks — only the chosen one's extras are part of the booking
      const others = await prisma.lead_packages.findMany({
        where: { lead_id: lead.id, id: { not: own.id } },          // 🔒 tenancy via the lead
        select: { id: true, extras: true },
      });
      await prisma.$transaction([
        // exactly one package can be the chosen one
        prisma.lead_packages.updateMany({ where: { lead_id: lead.id }, data: { is_selected: false } }),
        prisma.lead_packages.update({ where: { id: own.id }, data: { is_selected: true, extras } }),
        ...others
          .filter(r => Array.isArray(r.extras) && r.extras.some(x => x?.chosen))
          .map(r => prisma.lead_packages.update({
            where: { id: r.id },
            data: { extras: r.extras.map(x => (x?.chosen ? { ...x, chosen: false } : x)) },
          })),
        prisma.leads.update({
          where: { id: lead.id },
          // package_id is left alone: it has a foreign key to vendor_packages,
          // so it can't hold a lead_packages id. The chosen one is marked with
          // is_selected above and the snapshot carries the detail.
          data: { package_snapshot: snapshot, updated_at: new Date() },
        }),
      ]);
      const updated = await prisma.leads.findUnique({ where: { id: lead.id } });
      // "Cine Lux + Drone, Rush delivery" — the vendor sees what the client added at a glance
      const ticked = q.extras.filter(l => l.mode === 'optional').map(l => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name));
      const label = ticked.length ? `${own.name} + ${ticked.join(', ')}` : own.name;
      const books = await afterPick(lead, own.id, label.slice(0, 160), req, { extrasChanged, changed });
      return res.json({ lead: updated, money: await moneySummary(updated), books });
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
    const books = await afterPick(lead, p.id, p.name, req);
    res.json({ ok: true, money: await moneySummary(updated), books });
  } catch (e) { serverError(res, e); }
});

/* 💳 PUBLIC: POST /api/portal/:token/pay-card → a Stripe page on the VENDOR's own account for what is due now.
   The same rules as paying directly: a package chosen and the contract signed (lib/stripeConnect.js). */
router.post('/:token/pay-card', limit({ name: 'portal-pay-card', max: 20, windowMs: 60 * 60_000, key: (r) => r.params.token }), async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    if (!gateOpen(req, lead)) return res.status(403).json({ error: 'Please confirm your email first' });   // 🔒
    const contract = await prisma.contracts.findFirst({
      where: { lead_id: lead.id, status: { not: 'voided' } }, orderBy: { id: 'desc' }, select: { signed_at: true },   // 🔒 via the lead
    });
    if (!contract?.signed_at) return res.status(409).json({ error: 'Please sign your contract before paying' });
    const money = await moneySummary(lead);
    const due = Number(money.paid) > 0 ? Number(money.balance) : Number(money.deposit_amount);
    const [vset, vrow] = await Promise.all([
      prisma.vendor_settings.findUnique({ where: { vendor_id: lead.vendor_id }, select: { currency: true } }),
      prisma.vendors.findUnique({ where: { id: lead.vendor_id }, select: { country: true, business_name: true } }),
    ]);
    const what = Number(money.paid) > 0 ? 'Balance' : 'Deposit';
    const url = await cardCheckout({
      lead, amount: due, currency: currencyFor(vset?.currency, vrow?.country), token: req.params.token,
      description: `${vrow?.business_name || 'Booking'} — ${what}${lead.event_type ? ` · ${lead.event_type}` : ''}`,
    });
    res.json({ url });
  } catch (e) { res.status(e.status && e.status < 500 ? e.status : 500).json({ error: e.status ? e.message : 'Card payment could not start — please try again.' }); }
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
router.post('/:token/pay-direct', limit({ name: 'portal-pay', max: 30, windowMs: 60 * 60_000, key: (r) => r.params.token }), async (req, res) => {
  try {
    const lead = await leadByToken(req.params.token);
    if (!lead) return res.status(404).json({ error: 'Link not found' });
    if (!gateOpen(req, lead)) return res.status(403).json({ error: 'Please confirm your email first' });   // 🔒

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

    /* R3 (2026-10-30): the amount the client was asked to pay — the deposit — and the total for context. Both from
       moneySummary, the one place money is worked out: hours, extras, discount and any fixed deposit included */
    const sum = await moneySummary(lead);
    const total = Number(sum.final_total) || 0;
    const due = Number(sum.paid) > 0 ? Number(sum.balance) : Number(sum.deposit_amount);
    const money = (n) => `$${Math.round(n).toLocaleString('en')}`;
    notify(
      lead.vendor_id,
      `💰 ${lead.name || 'Client'} says they've paid`,
      `${chosen?.name || 'Booking'}${total ? ` · ${Number(sum.paid) > 0 ? 'balance' : 'deposit'} ${money(due)} of ${money(total)}` : ''} · confirm when the funds arrive`,
      'payment',
      { type: 'lead', id: lead.id },   // the confirm/deny banner lives on the lead
    );
    res.json({ ok: true });
  } catch (e) { serverError(res, e); }
});

export default router;
