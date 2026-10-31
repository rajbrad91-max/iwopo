/**
 * 🌐 Domain provisioner — makes vendor addresses live with no hand work (2026-10-31).
 *
 * Run as root by a systemd timer every 2 minutes, once per environment (live and staging), from that environment's
 * backend directory so its .env (DATABASE_URL, APP_URL) is the one used. Each run:
 *   1. Own domains: pending → DNS points here? → issuing → certificate (Let's Encrypt, webroot) → nginx server block
 *      from the template → `nginx -t` → reload → live, and the vendor is told ("Your domain is live").
 *      Failures are written to vendor_sites.domain_error and retried with a back-off.
 *   2. Domains that were removed (or lost) get their server block removed; their certificate is kept a while so a
 *      re-add is instant, and certbot's own renewals keep every live one valid.
 *   3. Vendor subdomains (<slug>.<platform>): once the wildcard certificate exists (scripts/wildcardCert.sh, which needs
 *      the Hostinger API token), the wildcard server block is installed and platform_settings 'vendor_subdomains' = 'on'.
 *
 * Safety: every hostname is re-validated here (normalizeDomain + a strict pattern) before it reaches a file name or a
 * command; commands run through execFile with argument arrays — never a shell string.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import prisma from '../src/config/prisma.js';
import { checkDomain, normalizeDomain } from '../src/lib/customDomain.js';
import { ownDomainAllowed, PLATFORM_HOST, APP_URL, forgetHosts } from '../src/lib/vendorHosts.js';
import { notify } from '../src/routes/notifications.js';
import { sendPlatformEmail } from '../src/routes/email.js';

const run = promisify(execFile);
const ENV = PLATFORM_HOST === 'iwopo.com' ? 'live' : 'staging';
const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');      // /var/www/iwopo[-staging]
const API_PORT = Number(process.env.PORT || (ENV === 'live' ? 3001 : 3002));
const SITES_DIR = '/etc/nginx/iwopo-vendor-domains';                                         // included by conf.d
const ACME_ROOT = '/var/www/acme';
const CERT_EMAIL = process.env.CERT_EMAIL || 'sales@iwopo.com';
const SAFE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RETRY_MS = { pending: 2 * 60_000, error: 30 * 60_000 };
const log = (...a) => console.log(new Date().toISOString(), `[domains:${ENV}]`, ...a);

const confFile = (domain) => path.join(SITES_DIR, `${ENV}-${domain}.conf`);
const certName = (domain) => `iwopo-vd-${domain}`;
const certDir = (domain) => `/etc/letsencrypt/live/${certName(domain)}`;
const due = (row, ms) => !row.domain_checked_at || Date.now() - new Date(row.domain_checked_at).getTime() >= ms;

/**
 * The server block for vendor addresses — the same app, served on the vendor's address.
 *   names     what nginx answers to (a domain list, or a regex for every vendor subdomain)
 *   canonical where port 80 (and www) send people: a fixed domain, or null for "the address they asked for"
 *   cert      the certificate directory (fullchain.pem + privkey.pem)
 *   www       the www. name that should redirect to the canonical domain, if any
 */
function serverBlock({ title, names, canonical, cert, www }) {
  const dist = path.join(APP_DIR, 'frontend/dist');
  const target = canonical ? `https://${canonical}$request_uri` : 'https://$host$request_uri';
  return `# 🌐 ${title} — written by scripts/domainProvisioner.js (${ENV}). Do not edit by hand: it is rewritten.
server {
    listen 80;
    listen [::]:80;
    server_name ${names};
    location /.well-known/acme-challenge/ { root ${ACME_ROOT}; }
    location / { return 301 ${target}; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${names};
    ssl_certificate ${cert}/fullchain.pem;
    ssl_certificate_key ${cert}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    include snippets/iwopo-security.conf;
${www ? `    if ($host = ${www}) { return 301 ${target}; }\n` : ''}    root ${dist};
    location /assets/ { add_header Cache-Control "public, immutable"; include snippets/iwopo-security.conf; }
    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 600s;
        client_max_body_size 0;
    }
    location = /robots.txt { proxy_pass http://127.0.0.1:${API_PORT}; proxy_set_header Host $host; }
    location / {
        # a couple's gallery, portal or contract never belongs in search results ($iwopo_vendor_robots is set per
        # path in conf.d/iwopo-vendor-domains.conf; empty = no header). Set here, in the location that finally
        # serves the page, because nginx drops headers from a location it only passes through.
        add_header X-Robots-Tag $iwopo_vendor_robots always;
        add_header Cache-Control "no-cache, must-revalidate" always;
        include snippets/iwopo-security.conf;
        try_files $uri $uri/ /index.html;
    }
}
`;
}

/** One vendor's own domain (with its www. when the vendor pointed that too). */
const domainBlock = (domain, withWww) => serverBlock({
  title: domain, names: withWww ? `${domain} www.${domain}` : domain, canonical: domain, cert: certDir(domain),
  www: withWww ? `www.${domain}` : null,
});

/** Every vendor subdomain of the platform, on the one wildcard certificate. */
const subdomainBlock = (cert) => serverBlock({
  title: `vendor subdomains of ${PLATFORM_HOST}`,
  names: `~^(?!www\\.)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${PLATFORM_HOST.replace(/\./g, '\\.')}$`,
  canonical: null, cert, www: null,
});

async function nginxReload() {
  await run('nginx', ['-t']);                       // throws (with nginx's words) on a bad config
  await run('systemctl', ['reload', 'nginx']);
}

async function issue(domain, withWww) {
  const args = ['certonly', '--webroot', '-w', ACME_ROOT, '--cert-name', certName(domain), '-d', domain,
    ...(withWww ? ['-d', `www.${domain}`] : []),
    '--non-interactive', '--agree-tos', '-m', CERT_EMAIL, '--keep-until-expiring'];
  await run('certbot', args, { timeout: 180_000 });
}

async function tellVendor(vendorId, domain) {
  notify(vendorId, `🌐 ${domain} is live`, 'Your clients’ links now use your own domain', 'settings', { type: 'settings', id: 'domain' });
  const v = await prisma.vendors.findUnique({ where: { id: vendorId }, select: { email: true, business_name: true } });
  if (v?.email) {
    await sendPlatformEmail(v.email, `🌐 ${domain} is live`,
      `Good news — ${domain} is now connected to ${v.business_name || 'your studio'}.\n\nFrom now on, the links your clients receive (inquiry form, packages, contracts, invoices and galleries) use https://${domain}.\n\n— iwopo`,
      `<p>Good news — <b>${domain}</b> is now connected to ${v.business_name || 'your studio'}.</p><p>From now on, the links your clients receive (inquiry form, packages, contracts, invoices and galleries) use <b>https://${domain}</b>.</p>`
    ).catch(e => log('email failed', domain, e.message));
  }
}

async function provisionOwnDomains() {
  const rows = await prisma.vendor_sites.findMany({
    where: { custom_domain: { not: null }, domain_status: { in: ['pending', 'issuing', 'error'] } },
    select: { vendor_id: true, custom_domain: true, domain_status: true, domain_checked_at: true },
  });
  for (const row of rows) {
    const domain = normalizeDomain(row.custom_domain);
    if (!domain || !SAFE.test(domain)) continue;
    if (!(await ownDomainAllowed(row.vendor_id))) continue;                  // plan or trial: not allowed, leave as is
    if (row.domain_status === 'pending' && !due(row, RETRY_MS.pending)) continue;
    if (row.domain_status === 'error' && !due(row, RETRY_MS.error)) continue;
    const mark = (data) => prisma.vendor_sites.update({ where: { vendor_id: row.vendor_id }, data: { domain_checked_at: new Date(), ...data } });

    const dns = await checkDomain(domain);
    if (!dns.ok) { await mark({ domain_status: 'pending', domain_error: dns.reason }); continue; }
    try {
      await mark({ domain_status: 'issuing', domain_error: null });
      await issue(domain, dns.wwwOk);
      fs.mkdirSync(SITES_DIR, { recursive: true });
      fs.writeFileSync(confFile(domain), domainBlock(domain, dns.wwwOk));
      try { await nginxReload(); }
      catch (e) { fs.rmSync(confFile(domain), { force: true }); throw e; }   // never leave nginx unable to reload
      await mark({ domain_status: 'live', domain_error: null, domain_live_at: new Date(), domain_verified_at: new Date() });
      forgetHosts();
      log('live', domain);
      await tellVendor(row.vendor_id, domain);
    } catch (e) {
      const why = String(e.stderr || e.message || e).replace(/\s+/g, ' ').slice(0, 290);
      await mark({ domain_status: 'error', domain_error: why });
      log('error', domain, why);
    }
  }
}

/**
 * Keep every server block matching what it should be: a domain no longer live here (removed, changed) is taken down;
 * a live one whose block differs from today's template is rewritten — so an improvement to the template reaches
 * every vendor on the next run, with no hand work. nginx is reloaded only when something changed, and a rewrite that
 * nginx refuses is put back as it was.
 */
async function syncBlocks() {
  if (!fs.existsSync(SITES_DIR)) return;
  const live = new Set((await prisma.vendor_sites.findMany({
    where: { custom_domain: { not: null }, domain_status: 'live' }, select: { custom_domain: true },
  })).map(r => normalizeDomain(r.custom_domain)).filter(Boolean));
  const before = new Map();
  for (const f of fs.readdirSync(SITES_DIR)) {
    if (!f.startsWith(`${ENV}-`) || !f.endsWith('.conf')) continue;
    const file = path.join(SITES_DIR, f);
    const domain = f.slice(ENV.length + 1, -5);
    const now = fs.readFileSync(file, 'utf8');
    if (!live.has(domain)) { before.set(file, now); fs.rmSync(file, { force: true }); log('removed', domain); continue; }
    const want = domainBlock(domain, now.includes(`www.${domain}`));
    if (want !== now) { before.set(file, now); fs.writeFileSync(file, want); log('updated', domain); }
  }
  if (!before.size) return;
  try { await nginxReload(); }
  catch (e) {
    for (const [file, text] of before) fs.writeFileSync(file, text);          // put every block back as it was
    log('sync refused, restored', String(e.stderr || e.message).slice(0, 200));
  }
}

/** Vendor subdomains: switched on once the wildcard certificate exists (see scripts/wildcardCert.sh). */
async function subdomains() {
  const cert = `/etc/letsencrypt/live/iwopo-wildcard-${PLATFORM_HOST}`;
  const conf = `/etc/nginx/sites-enabled/iwopo-vendor-subdomains-${ENV}`;
  const has = fs.existsSync(`${cert}/fullchain.pem`);
  const want = has ? subdomainBlock(cert) : null;
  const now = fs.existsSync(conf) ? fs.readFileSync(conf, 'utf8') : null;
  if (has && want !== now) {                                   // first time, or the template improved
    fs.writeFileSync(conf, want);
    try { await nginxReload(); log(now ? 'vendor subdomains updated' : 'vendor subdomains enabled'); }
    catch (e) {
      if (now) fs.writeFileSync(conf, now); else fs.rmSync(conf, { force: true });
      log('subdomain block refused', String(e.stderr || e.message).slice(0, 200));
    }
  }
  const state = has && fs.existsSync(conf) ? 'on' : 'off';
  await prisma.platform_settings.upsert({ where: { key: 'vendor_subdomains' }, update: { value: state }, create: { key: 'vendor_subdomains', value: state } });
}

async function main() {
  fs.mkdirSync(ACME_ROOT, { recursive: true });
  await provisionOwnDomains();
  await syncBlocks();
  await subdomains();
}

main().catch(e => log('run failed', e.message)).finally(async () => { await prisma.$disconnect(); process.exit(0); });
