/**
 * 🔗 The public doors of a vendor whose access has ended (lib/accountLapse.js — Raj, 2026-11-15).
 *   'new'  — anything that brings in new business or changes something: the inquiry form, the assistant, a couple
 *            choosing, signing, paying or uploading. Open only while the account is.
 *   'view' — a couple opening what was shared with them, and the vendor's website. Open until the account is suspended.
 * Mounted in server.js before each router with a public door. Each door says how to find its vendor from the request. A request that matches no door, or names nothing that exists,
 * goes on to its route untouched — the route answers its own "not found".
 */
import prisma from '../config/prisma.js';
import { openTo } from '../lib/accountLapse.js';
import { resolveHost } from '../lib/vendorHosts.js';
import { serverError } from '../lib/httpError.js';

const parts = (req) => req.path.split('/').filter(Boolean);
const reading = (req) => req.method === 'GET' || req.method === 'HEAD';
const idOf = async (query) => { const r = await query; return r?.vendor_id ?? r?.id ?? null; };
const albumVendor = (token) => idOf(prisma.albums.findFirst({ where: { public_token: String(token || '') }, select: { vendor_id: true } }));
const slugVendor = (slug) => idOf(prisma.vendors.findUnique({ where: { slug: String(slug || '').toLowerCase() }, select: { id: true } }));
const hostVendor = async (req) => (await resolveHost(req.headers['x-forwarded-host'] || req.headers.host))?.vendorId ?? null;

/* door → (req) → { vendorId, need } | null */
const DOORS = {
  // 🖼️ client galleries and live shoots stay usable through the read-only week, favourites and all
  gallery: async (req) => {
    const [a, b] = parts(req);
    if (!a) return null;
    if (a === 'vendor') return { vendorId: await idOf(prisma.vendors.findFirst({ where: { gallery_token: String(b || '') }, select: { id: true } })), need: 'view' };
    return { vendorId: await albumVendor(a === 'vendor-cover' ? b : a), need: 'view' };
  },
  live: async (req) => { const [a] = parts(req); return a ? { vendorId: await albumVendor(a), need: 'view' } : null; },
  // 📤 File Flyer: opening and downloading is viewing; a client sending files back is new
  files: async (req) => {
    const [a, b] = parts(req);
    if (!a) return null;
    return { vendorId: await idOf(prisma.file_shares.findFirst({ where: { token: a }, select: { vendor_id: true } })), need: reading(req) || b === 'unlock' ? 'view' : 'new' };
  },
  // 💍 the client portal: looking (and proving who you are) is viewing; choosing and paying is new
  portal: async (req) => {
    const [a, b] = parts(req);
    if (!a) return null;
    return { vendorId: await idOf(prisma.leads.findFirst({ where: { client_token: a }, select: { vendor_id: true } })), need: reading(req) || b === 'verify' ? 'view' : 'new' };
  },
  // ✍️ a contract: reading and downloading is viewing; signing is new
  contract: async (req) => {
    const [a, b] = parts(req);
    if (!['sign', 'download', 'certificate'].includes(a) || !b) return null;
    return { vendorId: await idOf(prisma.contracts.findFirst({ where: { token: b }, select: { vendor_id: true } })), need: a === 'sign' && !reading(req) ? 'new' : 'view' };
  },
  invoice: async (req) => {
    const [a, b] = parts(req);
    if (a !== 'view' || !b) return null;
    return { vendorId: await idOf(prisma.invoices.findFirst({ where: { token: b }, select: { vendor_id: true } })), need: 'view' };
  },
  // 🌐 the vendor's website
  site: async (req) => {
    const p = parts(req);
    if (!reading(req) || !p.length) return null;
    if (p[0] === 'by-host') return { vendorId: await hostVendor(req), need: 'view' };
    if (p[0] === 'photo') return { vendorId: Number(p[1]) || null, need: 'view' };
    if (p.length !== 1) return null;
    return { vendorId: await idOf(prisma.vendor_sites.findFirst({ where: { slug: p[0], published: true }, select: { vendor_id: true } })), need: 'view' };
  },
  // 📝 the inquiry form, and what it sends
  inquiry: async (req) => {
    const p = parts(req);
    if (!reading(req) || p.length !== 1 || p[0] === 'my') return null;   // /my is the vendor's own settings
    return { vendorId: p[0] === 'by-host' ? await hostVendor(req) : await slugVendor(p[0]), need: 'new' };
  },
  lead: async (req) => (req.method === 'POST' && parts(req).length === 0 && req.body?.vendor_slug ? { vendorId: await slugVendor(req.body.vendor_slug), need: 'new' } : null),
  // 🤖 Wopo Assistant on the vendor's pages
  chat: async (req) => { const [a, b] = parts(req); return a === 'chat' && b ? { vendorId: await slugVendor(b), need: 'new' } : null; },
};

const CLOSED = {
  new: { error: 'studio_closed', message: 'This business isn’t taking new requests online right now — please contact them directly.' },
  view: { error: 'link_closed', message: 'This page isn’t available right now — please contact the business directly.' },
};

export function publicDoor(door) {
  const find = DOORS[door];
  return async (req, res, next) => {
    try {
      const hit = await find(req);
      if (!hit?.vendorId || await openTo(hit.vendorId, hit.need)) return next();
      return res.status(403).json(CLOSED[hit.need]);
    } catch (e) { return serverError(res, e); }
  };
}
