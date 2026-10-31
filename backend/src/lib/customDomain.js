import dns from 'node:dns/promises';

/**
 * 🌐 Vendors bring their own domain.
 *
 * iwopo does not sell domains. A vendor registers theirs wherever they like,
 * points two records at this server, and their site answers there instead of on
 * a /site/<slug> path. This file is the part that decides whether a domain is
 * safe to accept and whether it is actually pointed at us yet.
 *
 * Nothing here issues a certificate. That is deliberate: a domain must be shown
 * to resolve to this server FIRST, or anyone could name a domain they don't own
 * and have us request certificates for it until the rate limit stops us.
 */

/** Our own hostnames. A vendor may not claim one, or anything under one. */
const RESERVED = ['iwopo.com', 'alphabetaone.com', 'localhost'];

/**
 * Whatever a vendor pastes in — with the scheme, a path, a stray space, mixed
 * case — reduced to a bare hostname, or null if it isn't one.
 */
export function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  d = d.replace(/^www\./, '');            // www is added by us, not stored
  d = d.replace(/\.$/, '');               // a trailing dot is legal DNS, not legal here

  // letters, digits and hyphens per label; at least one dot; a real-looking TLD
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return null;
  if (RESERVED.some(r => d === r || d.endsWith('.' + r))) return null;
  return d;
}

/**
 * The addresses a vendor has to point at. Read from our own hostname rather
 * than hard-coded, so moving the server doesn't leave every vendor pointing at
 * an address nothing answers on.
 */
export async function serverIps() {
  const host = process.env.APP_HOST || 'iwopo.com';
  try { return await dns.resolve4(host); } catch { return []; }
}

/**
 * Does this domain actually point here? Returns what we found either way — a
 * vendor who mistyped a record needs to see what their DNS says, not just the
 * word "failed".
 */
export async function checkDomain(domain) {
  const ours = await serverIps();
  if (!ours.length) return { ok: false, reason: 'server_unknown', ours, root: [], www: [] };

  const lookup = async (h) => { try { return await dns.resolve4(h); } catch { return []; } };
  const { sub } = splitDomain(domain);
  const [root, www] = await Promise.all([lookup(domain), sub ? Promise.resolve([]) : lookup('www.' + domain)]);   // www only for a main domain

  const hits = (list) => list.some(ip => ours.includes(ip));
  const rootOk = hits(root);
  const wwwOk = hits(www);

  // the root is what matters; www is a courtesy we report but don't insist on
  if (!root.length) return { ok: false, reason: 'no_record', ours, root, www, rootOk, wwwOk };
  if (!rootOk) return { ok: false, reason: 'points_elsewhere', ours, root, www, rootOk, wwwOk };
  return { ok: true, reason: 'ok', ours, root, www, rootOk, wwwOk };
}

/* Two-part endings, so "studio.co.uk" counts as a main domain and "clients.studio.co.uk" as a subdomain. */
const TWO_PART = new Set(['co.uk', 'org.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'org.nz', 'co.in', 'net.in', 'org.in',
  'com.pk', 'net.pk', 'com.bd', 'co.za', 'com.sg', 'com.my', 'com.ph', 'com.mx', 'com.br', 'com.ar', 'co.jp', 'com.np', 'com.lk', 'ae.org', 'co.ae', 'com.sa', 'com.tr', 'co.il']);

/** The registrable part and the label in front of it: clients.studio.co.uk → { root: 'studio.co.uk', sub: 'clients' }. */
export function splitDomain(domain) {
  const parts = String(domain || '').split('.');
  const tail = parts.slice(-2).join('.');
  const rootLen = TWO_PART.has(tail) ? 3 : 2;
  return { root: parts.slice(-rootLen).join('.'), sub: parts.slice(0, -rootLen).join('.') || null };
}

/** What the vendor types into their domain company: one record for a subdomain, two for a main domain. */
export async function dnsInstructions(domain) {
  if (!domain) return [];
  const ip = (await serverIps())[0] || '';
  const { root, sub } = splitDomain(domain);
  if (sub) return [{ type: 'A', name: sub, value: ip, note: `points ${domain} at iwopo (at your ${root} domain company)` }];
  return [
    { type: 'A', name: '@', value: ip, note: 'the domain itself' },
    { type: 'A', name: 'www', value: ip, note: 'so www works too' },
  ];
}
