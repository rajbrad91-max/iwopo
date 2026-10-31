#!/usr/bin/env node
/**
 * 🔑 certbot DNS hook for Hostinger (2026-10-31) — proves to Let's Encrypt that we control a domain by adding, then
 * removing, a TXT record through Hostinger's DNS API. Used only for the wildcard certificate (*.iwopo.com), which
 * cannot be proven over HTTP.
 *
 *   certbot … --manual-auth-hook "hostingerDnsHook.mjs auth" --manual-cleanup-hook "hostingerDnsHook.mjs cleanup"
 *
 * certbot passes CERTBOT_DOMAIN (e.g. iwopo.com) and CERTBOT_VALIDATION (the TXT value). The API token is read from
 * /etc/iwopo/hostinger.token (root only, 600) — never from the app's .env, never logged.
 * API: https://developers.hostinger.com — PUT/DELETE /api/dns/v1/zones/{domain}.
 */
import fs from 'node:fs';

const TOKEN_FILE = '/etc/iwopo/hostinger.token';
const API = 'https://developers.hostinger.com/api/dns/v1/zones';
const mode = process.argv[2];
const domain = String(process.env.CERTBOT_DOMAIN || '').replace(/^\*\./, '').toLowerCase();
const value = String(process.env.CERTBOT_VALIDATION || '');

if (!/^[a-z0-9.-]+\.[a-z]{2,63}$/.test(domain)) { console.error('bad CERTBOT_DOMAIN'); process.exit(1); }
const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
const call = async (method, body) => {
  const r = await fetch(`${API}/${domain}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { console.error(`Hostinger ${method} ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
};

if (mode === 'auth') {
  await call('PUT', { overwrite: false, zone: [{ name: '_acme-challenge', type: 'TXT', ttl: 300, records: [{ content: value }] }] });
  await new Promise(r => setTimeout(r, 90_000));          // let the record reach Let's Encrypt's resolvers
} else if (mode === 'cleanup') {
  await call('DELETE', { filters: [{ name: '_acme-challenge', type: 'TXT' }] });
} else {
  console.error('usage: hostingerDnsHook.mjs auth|cleanup'); process.exit(1);
}
