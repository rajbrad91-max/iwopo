/**
 * 🌐 /api/domain — a vendor's web address (2026-10-31).
 *
 * Every vendor has a free address (<slug>.iwopo.com, live once the wildcard certificate is installed). Vendors whose
 * plan includes the own-domain feature (the top plan, never a trial) can also connect a domain they own; from then on
 * scripts/domainProvisioner.js does the rest by itself: checks DNS, fits the certificate, switches it on, tells them.
 *
 * Moved here from routes/sites.js so it no longer needs the website feature: the address is where a vendor's CLIENTS
 * go (inquiry form, portal, contracts, galleries), whether or not they use the website builder.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { normalizeDomain, checkDomain, dnsInstructions } from '../lib/customDomain.js';
import { ownDomainAllowed, subdomainsLive, subdomainFor, slugIsSubdomainSafe, clientBaseUrl, forgetHosts } from '../lib/vendorHosts.js';

const router = express.Router();
router.use(requireAuth);
const vendorOf = (req) => Number(req.user.vendor_id) || null;      // 🔒 from the token, never the request

async function snapshot(v) {
  const [vendor, site, allowed, subsOn, base] = await Promise.all([
    prisma.vendors.findUnique({ where: { id: v }, select: { slug: true } }),
    prisma.vendor_sites.findUnique({
      where: { vendor_id: v },
      select: { custom_domain: true, domain_status: true, domain_error: true, domain_checked_at: true, domain_live_at: true },
    }),
    ownDomainAllowed(v), subdomainsLive(), clientBaseUrl(v),
  ]);
  const slugOk = slugIsSubdomainSafe(vendor?.slug);
  return {
    client_base_url: base,                                         // what every client link uses right now
    subdomain: { address: slugOk ? subdomainFor(vendor.slug) : null, live: slugOk && subsOn },
    own: {
      allowed,                                                     // top plan and not on trial
      domain: site?.custom_domain || '',
      status: site?.custom_domain ? (site.domain_status || 'pending') : 'none',
      error: site?.domain_error || null,
      checked_at: site?.domain_checked_at || null,
      live_at: site?.domain_live_at || null,
      instructions: await dnsInstructions(site?.custom_domain || ''),
    },
  };
}

// GET /api/domain → the vendor's free address, own domain and where it is up to
router.get('/', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try { res.json(await snapshot(v)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/domain { domain } → connect a domain (or clear it with an empty value). Only records the intent; the
// provisioner checks DNS within a couple of minutes and does the rest.
router.put('/', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    const raw = String(req.body?.domain || '').trim();
    if (!raw) {
      await prisma.vendor_sites.updateMany({                       // 🔒 own row; the provisioner takes the site down
        where: { vendor_id: v },
        data: { custom_domain: null, domain_status: 'none', domain_error: null, domain_verified_at: null, domain_checked_at: null, domain_live_at: null },
      });
      forgetHosts();
      return res.json(await snapshot(v));
    }
    if (!(await ownDomainAllowed(v))) {
      return res.status(403).json({ error: 'Your own domain is part of our top plan.', code: 'plan_required' });
    }
    const domain = normalizeDomain(raw);
    if (!domain) return res.status(400).json({ error: "That doesn't look like a domain name." });
    const taken = await prisma.vendor_sites.findFirst({ where: { custom_domain: domain, NOT: { vendor_id: v } }, select: { id: true } });
    if (taken) return res.status(409).json({ error: 'That domain is already connected to another studio.' });
    const fields = { custom_domain: domain, domain_status: 'pending', domain_error: null, domain_verified_at: null, domain_checked_at: null, domain_live_at: null };
    await prisma.vendor_sites.upsert({ where: { vendor_id: v }, update: fields, create: { ...fields, vendor_id: v } });   // 🔒
    forgetHosts();
    res.json(await snapshot(v));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/domain/check → read DNS now and say what was found. When it points here, the provisioner is asked to act
// on its next run (checked_at cleared) rather than waiting out its back-off.
router.post('/check', async (req, res) => {
  const v = vendorOf(req);
  if (!v) return res.status(400).json({ error: 'Not a vendor account' });
  try {
    const site = await prisma.vendor_sites.findUnique({ where: { vendor_id: v }, select: { custom_domain: true, domain_status: true } });
    if (!site?.custom_domain) return res.status(400).json({ error: 'No domain connected yet.' });
    const result = await checkDomain(site.custom_domain);
    if (site.domain_status !== 'live') {
      await prisma.vendor_sites.update({
        where: { vendor_id: v },
        data: result.ok ? { domain_status: 'pending', domain_error: null, domain_checked_at: null } : { domain_error: result.reason },
      });
    }
    res.json({ ...result, ...(await snapshot(v)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
