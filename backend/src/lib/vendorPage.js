import fs from 'node:fs';
import path from 'node:path';
import prisma from '../config/prisma.js';
import { resolveHost } from './vendorHosts.js';

/**
 * 🔗 The page shell on a vendor's own address — <slug>.iwopo.com or their own domain (Raj, 2026-11-11). It is the same
 * index.html the app always serves, with the vendor's own name, the page it is, its address and their logo in the
 * title and the link-preview tags (Open Graph / Twitter), so a link shared on WhatsApp, Messenger or by text shows the
 * vendor, never iwopo. nginx sends a vendor address's PAGE requests here (scripts/domainProvisioner.js, location
 * @page); files, assets and /api are served exactly as before, and iwopo's own pages never come here.
 */
const INDEX = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../frontend/dist/index.html');

let shell = null, shellAt = 0;
/** the built index.html, read again only when a new build replaces it */
function readShell() {
  const at = fs.statSync(INDEX).mtimeMs;
  if (shell === null || at !== shellAt) { shell = fs.readFileSync(INDEX, 'utf8'); shellAt = at; }
  return shell;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** which client page a path is — what its preview says it is */
const PAGES = [
  [/^\/inquiry(\/|$)/, 'Inquiry', (n) => `Tell ${n} about your day — the date, the place and what you would like.`],
  [/^\/(gallery|g)\//, 'Gallery', (n) => `Your photos from ${n}.`],
  [/^\/sign\//, 'Contract', (n) => `Your contract from ${n}.`],
  [/^\/invoice\//, 'Invoice', (n) => `Your invoice from ${n}.`],
  [/^\/portal(\/|$)/, 'Client area', (n) => `Your client area with ${n}.`],
  [/^\/f\//, 'Files', (n) => `Files from ${n}.`],
];

/** set one <meta> tag's content (by property or name), or remove the tag when there is nothing to say */
function setMeta(html, key, value) {
  const re = new RegExp(`<meta (property|name)="${key}" content="[^"]*">`);
  return html.replace(re, value == null ? '' : (_m, attr) => `<meta ${attr}="${key}" content="${esc(value)}">`);
}

/** The page shell for this request's address: the vendor's own preview, or the shell unchanged for anything else. */
export async function vendorPage(req, res) {
  try {
    let html = readShell();
    const host = await resolveHost(req.headers.host);
    if (host) {
      const v = await prisma.vendors.findUnique({ where: { id: host.vendorId }, select: { business_name: true, logo_path: true } });
      const name = v?.business_name || host.slug;
      const page = PAGES.find(([re]) => re.test(req.path));
      const title = page ? `${page[1]} · ${name}` : name;
      const description = page ? page[2](name) : name;
      const url = `https://${host.host}${req.path}`;
      const image = v?.logo_path ? `https://${host.host}/api/me/logo/${encodeURIComponent(path.basename(v.logo_path))}` : null;
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`);
      for (const [key, value] of [
        ['description', description], ['og:site_name', name], ['og:title', title], ['og:description', description],
        ['og:url', url], ['og:image', image], ['twitter:card', 'summary'],
        ['twitter:title', title], ['twitter:description', description], ['twitter:image', image],
      ]) html = setMeta(html, key, value);
    }
    res.set('Cache-Control', 'no-cache, must-revalidate').type('html').send(html);
  } catch (e) {
    console.error('[vendorPage]', e.message);
    res.status(500).type('text').send('This page could not be loaded. Please try again.');
  }
}
