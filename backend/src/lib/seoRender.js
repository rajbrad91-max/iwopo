/**
 * 🔎 Serving iwopo.com's marketing pages.
 *
 * Standalone pages (features, pricing, audiences, guides) are sent whole by renderPage() — see seoPage.js for why.
 * The home page stays the designed React landing: its head and crawlable copy are written into the app shell.
 *
 * Fixed 2026-10-31: the shell's own tags were stripped AFTER this page's head was inserted, so the canonical and
 * every og:/twitter: tag were deleted from the page again — Google saw no canonical anywhere. Strip first, then
 * insert.
 *
 * Falls through untouched if anything is wrong — a failure here must never take the site down.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPages } from './seoContent.js';
import { renderPage, headTags } from './seoPage.js';

/* From this file, not from the working directory (pm2 starts the app in backend/). */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../../frontend/dist/index.html');

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The home page's crawlable copy, inside the React root (React replaces it when it mounts). */
function homeBody(page, pages) {
  const parts = [`<h1>${esc(page.h1)}</h1>`, ...(page.body || []).map(p => `<p>${esc(p)}</p>`)];
  const links = pages.filter(p => p.standalone && p.path !== page.path);
  parts.push('<nav><ul>' + links.map(p => `<li><a href="${p.path}">${esc(p.h1)}</a></li>`).join('') + '</ul></nav>');
  if (page.faq?.length) {
    parts.push('<h2>Frequently asked questions</h2>');
    for (const [q, a] of page.faq) parts.push(`<h3>${esc(q)}</h3><p>${esc(a)}</p>`);
  }
  return parts.join('\n    ');
}

/** Only iwopo.com itself serves marketing pages — never a vendor's own domain or staging. */
const isMarketingHost = (req) => /^(www\.)?iwopo\.com$/i.test(String(req.hostname || ''))
  || /^(www\.)?alphabetaone\.com$/i.test(String(req.hostname || ''));   // staging: same pages, but noindex (robots + nginx)

export function seoMiddleware() {
  return async (req, res, next) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!String(req.headers.accept || '').includes('text/html')) return next();
      if (!isMarketingHost(req)) return next();

      const reqPath = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
      const pages = await allPages();
      const page = pages.find(p => p.path === reqPath);
      if (!page) return next();

      res.set('Cache-Control', 'public, max-age=300');
      if (page.standalone) return res.type('html').send(renderPage(page, pages));

      let html;
      try { html = fs.readFileSync(DIST, 'utf8'); } catch { return next(); }   // not built — let nginx answer
      html = html
        .replace(/<meta name="description"[^>]*>\s*/g, '')
        .replace(/<link rel="canonical"[^>]*>\s*/g, '')
        .replace(/<meta property="og:[^>]*>\s*/g, '')
        .replace(/<meta name="twitter:[^>]*>\s*/g, '')
        .replace(/<title>[\s\S]*?<\/title>/, headTags(page, pages))
        .replace('<div id="root"></div>', `<div id="root">\n    ${homeBody(page, pages)}\n  </div>`);
      res.type('html').send(html);
    } catch { next(); }
  };
}
