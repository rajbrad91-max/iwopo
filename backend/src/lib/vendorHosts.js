/**
 * 🌐 Which vendor an address belongs to, and which address a vendor's clients should be sent to (2026-10-31).
 *
 * Two kinds of vendor address, both served by this same app:
 *   • subdomain — <slug>.iwopo.com (staging: <slug>.alphabetaone.com). Every vendor, automatically, once the
 *     wildcard certificate is installed (platform_settings 'vendor_subdomains' = 'on', set by the provisioner).
 *   • custom    — a domain the vendor owns (vendor_sites.custom_domain, domain_status 'live'). Only for vendors whose
 *     plan includes DOMAIN_FEATURE and who are not on a trial (Raj: "only the top plan, never trials").
 *
 * Everything else — the panel, log-in, marketing pages — lives on the platform host (APP_URL).
 * One file decides all of it, so the link a vendor copies, the host the server recognises and the host nginx
 * serves can never disagree.
 */
import prisma from '../config/prisma.js';
import { normalizeDomain } from './customDomain.js';
import { getFeatures } from './entitlements.js';

/** The plan feature that unlocks a vendor's own domain and removes "Powered by iwopo". */
export const DOMAIN_FEATURE = 'custom_domain';

export const APP_URL = (process.env.APP_URL || 'https://iwopo.com').replace(/\/+$/, '');
/** iwopo.com on live, alphabetaone.com on staging — read from APP_URL, never hard-coded. */
export const PLATFORM_HOST = new URL(APP_URL).hostname.replace(/^www\./, '').toLowerCase();

/** Labels no vendor may hold as a subdomain: they are, or may one day be, ours. */
const RESERVED_LABELS = new Set([
  'www', 'api', 'app', 'admin', 'panel', 'mail', 'email', 'webmail', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2',
  'connect', 'domains', 'status', 'help', 'support', 'docs', 'blog', 'cdn', 'static', 'assets', 'media', 'files',
  'staging', 'dev', 'test', 'demo', 'beta', 'm', 'autodiscover', 'autoconfig', 'billing', 'pay', 'secure',
]);

/** A vendor slug that can be a DNS label: lowercase letters, digits, inner hyphens, 1–63 long, not reserved. */
export function slugIsSubdomainSafe(slug) {
  const s = String(slug || '');
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s) && !RESERVED_LABELS.has(s);
}

export const subdomainFor = (slug) => `${slug}.${PLATFORM_HOST}`;

/* A short memory: these answers are read on many requests and change rarely. Bounded, 60 s. */
const TTL = 60_000, MAX = 5_000;
const memo = new Map();
const remember = (k, v) => { if (memo.size >= MAX) memo.delete(memo.keys().next().value); memo.set(k, { v, at: Date.now() }); return v; };
const recall = (k) => { const e = memo.get(k); return e && Date.now() - e.at < TTL ? e : null; };
/** Forget what is known about a host or vendor (call after a domain or plan change). */
export function forgetHosts() { memo.clear(); }

/** Are vendor subdomains switched on? (The provisioner sets this once the wildcard certificate is in place.) */
export async function subdomainsLive() {
  const hit = recall('setting:subdomains'); if (hit) return hit.v;
  const row = await prisma.platform_settings.findUnique({ where: { key: 'vendor_subdomains' }, select: { value: true } }).catch(() => null);
  return remember('setting:subdomains', row?.value === 'on');
}

/**
 * May this vendor use their own domain (and drop "Powered by iwopo")? Their plan must include DOMAIN_FEATURE and they
 * must not be on a trial — a feature a vendor can lose, so a downgrade takes the domain offline again.
 */
export async function ownDomainAllowed(vendorId) {
  const k = `allowed:${vendorId}`; const hit = recall(k); if (hit) return hit.v;
  const v = await prisma.vendors.findUnique({ where: { id: Number(vendorId) }, select: { status: true } });
  if (!v || String(v.status || '').toLowerCase() === 'trial') return remember(k, false);
  const features = await getFeatures(vendorId);
  return remember(k, features.has(DOMAIN_FEATURE) || features.has('*'));
}

/**
 * The vendor an address belongs to: { vendorId, slug, kind: 'subdomain' | 'custom', host } — or null for the
 * platform itself and for anything unknown. The Host header comes from nginx (the real request line), so it is a
 * credential here; a body or query value never is.
 */
export async function resolveHost(rawHost) {
  const host = String(rawHost || '').split(':')[0].trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === PLATFORM_HOST || host === `www.${PLATFORM_HOST}` || host === 'localhost' || host === '127.0.0.1') return null;
  const k = `host:${host}`; const hit = recall(k); if (hit) return hit.v;

  if (host.endsWith(`.${PLATFORM_HOST}`)) {
    const label = host.slice(0, -(PLATFORM_HOST.length + 1));
    if (label.includes('.') || !slugIsSubdomainSafe(label)) return remember(k, null);
    const v = await prisma.vendors.findUnique({ where: { slug: label }, select: { id: true, slug: true } });
    return remember(k, v ? { vendorId: v.id, slug: v.slug, kind: 'subdomain', host } : null);
  }

  const domain = normalizeDomain(host);
  if (!domain) return remember(k, null);
  const site = await prisma.vendor_sites.findFirst({
    where: { custom_domain: domain, domain_status: 'live' },
    select: { vendor_id: true, vendors: { select: { slug: true } } },
  });
  if (!site || !(await ownDomainAllowed(site.vendor_id))) return remember(k, null);
  return remember(k, { vendorId: site.vendor_id, slug: site.vendors?.slug, kind: 'custom', host: domain });
}

/**
 * Where this vendor's clients are sent — the base of every link a client receives (portal, gallery, contract,
 * invoice, file, inquiry form). Own live domain → their domain; else their subdomain once subdomains are live;
 * else the platform (links that always worked keep working).
 */
export async function clientBaseUrl(vendorId) {
  const k = `base:${vendorId}`; const hit = recall(k); if (hit) return hit.v;
  const v = await prisma.vendors.findUnique({
    where: { id: Number(vendorId) },
    select: { slug: true, vendor_sites: { select: { custom_domain: true, domain_status: true } } },
  });
  if (!v) return APP_URL;
  const site = Array.isArray(v.vendor_sites) ? v.vendor_sites[0] : v.vendor_sites;
  if (site?.custom_domain && site.domain_status === 'live' && await ownDomainAllowed(vendorId)) return remember(k, `https://${site.custom_domain}`);
  if (slugIsSubdomainSafe(v.slug) && await subdomainsLive()) return remember(k, `https://${subdomainFor(v.slug)}`);
  return remember(k, APP_URL);
}

/** Express middleware: req.hostVendor = the vendor this request's address belongs to (or null). Never throws. */
export function hostContext() {
  return async (req, res, next) => {
    try { req.hostVendor = await resolveHost(req.headers['x-forwarded-host'] || req.headers.host); }
    catch { req.hostVendor = null; }
    next();
  };
}
