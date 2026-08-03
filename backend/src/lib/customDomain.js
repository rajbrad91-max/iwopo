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
  const [root, www] = await Promise.all([lookup(domain), lookup('www.' + domain)]);

  const hits = (list) => list.some(ip => ours.includes(ip));
  const rootOk = hits(root);
  const wwwOk = hits(www);

  // the root is what matters; www is a courtesy we report but don't insist on
  if (!root.length) return { ok: false, reason: 'no_record', ours, root, www, rootOk, wwwOk };
  if (!rootOk) return { ok: false, reason: 'points_elsewhere', ours, root, www, rootOk, wwwOk };
  return { ok: true, reason: 'ok', ours, root, www, rootOk, wwwOk };
}

/** What the vendor has to type into their registrar. */
export async function dnsInstructions(domain) {
  const ips = await serverIps();
  return [
    { type: 'A', name: '@', value: ips[0] || '', note: 'the domain itself' },
    { type: 'A', name: 'www', value: ips[0] || '', note: 'so www works too' },
  ];
}
