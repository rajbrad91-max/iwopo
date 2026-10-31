/**
 * 🔒 On a vendor's own address, only that vendor's client pages exist (2026-10-31).
 *
 * perfectposes.iwopo.com must never open another vendor's gallery, portal or contract, even with a valid link —
 * the address is the vendor's brand. Every public, token-addressed API route is listed here with how to find the
 * vendor that owns the token; on a vendor host a mismatch is a plain 404 (the same answer as a link that never
 * existed). On the platform host (iwopo.com) nothing changes, so every link ever sent keeps working.
 *
 * Mounted on /api after hostContext(); req.path is relative to /api.
 */
import prisma from '../config/prisma.js';

const owner = {
  lead: async (t) => (await prisma.leads.findUnique({ where: { client_token: t }, select: { vendor_id: true } }))?.vendor_id,
  contract: async (t) => (await prisma.contracts.findUnique({ where: { token: t }, select: { vendor_id: true } }))?.vendor_id,
  invoice: async (t) => (await prisma.invoices.findUnique({ where: { token: t }, select: { vendor_id: true } }))?.vendor_id,
  album: async (t) => (await prisma.albums.findUnique({ where: { public_token: t }, select: { vendor_id: true } }))?.vendor_id,
  vendorGallery: async (t) => (await prisma.vendors.findUnique({ where: { gallery_token: t }, select: { id: true } }))?.id,
  share: async (t) => (await prisma.file_shares.findUnique({ where: { token: t }, select: { vendor_id: true } }))?.vendor_id,
  slug: async (s) => (await prisma.vendors.findUnique({ where: { slug: s }, select: { id: true } }))?.id,
  site: async (s) => (await prisma.vendor_sites.findUnique({ where: { slug: s }, select: { vendor_id: true } }))?.vendor_id,
};

/** [method or '*', path pattern, which owner lookup] — the first match decides. */
const ROUTES = [
  ['*', /^\/portal\/([a-f0-9]+)(?:\/|$)/i, owner.lead],
  ['*', /^\/contracts\/sign\/([a-f0-9]+)(?:\/|$)/i, owner.contract],
  ['*', /^\/contracts\/download\/([a-f0-9]+)(?:\/|$)/i, owner.contract],
  ['*', /^\/contracts\/certificate\/([a-f0-9]+)(?:\/|$)/i, owner.contract],
  ['*', /^\/invoices\/view\/([a-f0-9]+)(?:\/|$)/i, owner.invoice],
  ['*', /^\/g\/vendor\/([a-z0-9]+)(?:\/|$)/i, owner.vendorGallery],
  ['*', /^\/g\/vendor-cover\/([a-z0-9]+)(?:\/|$)/i, owner.album],
  ['*', /^\/g\/([a-z0-9]+)(?:\/|$)/i, owner.album],
  ['*', /^\/f\/([A-Za-z0-9]+)(?:\/|$)/, owner.share],
  ['GET', /^\/inquiry-settings\/(?!by-host(?:\/|$))([a-z0-9-]+)\/?$/i, owner.slug],
  ['GET', /^\/sites\/(?!by-host|domain)([a-z0-9-]+)\/?$/i, owner.site],
];

export function hostGuard() {
  return async (req, res, next) => {
    const host = req.hostVendor;
    if (!host) return next();                                   // the platform host: unchanged
    try {
      // the public inquiry form posts its vendor by slug — on a vendor's address it must be that vendor
      if (req.method === 'POST' && req.path === '/leads' && req.body?.vendor_slug
          && String(req.body.vendor_slug).toLowerCase() !== String(host.slug || '').toLowerCase()) {
        return res.status(404).json({ error: 'Not found' });
      }
      for (const [method, re, lookup] of ROUTES) {
        if (method !== '*' && method !== req.method) continue;
        const m = req.path.match(re);
        if (!m) continue;
        const vendorId = await lookup(m[1]);
        if (vendorId && Number(vendorId) !== Number(host.vendorId)) return res.status(404).json({ error: 'Not found' });
        break;
      }
      next();
    } catch { next(); }                                         // a lookup failure must not take a page down
  };
}
