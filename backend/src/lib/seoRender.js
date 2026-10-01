/**
 * 🔎 Serving marketing pages with their content already in the HTML.
 *
 * ⚠️ This is the part that actually matters. Meta tags describe a page;
 * Google ranks a page for the WORDS ON IT, and the words were in JavaScript
 * inside an empty div. A crawler saw nothing to rank.
 *
 * So Express serves these routes itself, with the title, the description and
 * the body text written into the HTML before it leaves. React mounts over the
 * same div a moment later and the visitor never sees the difference — but the
 * crawler, which does not run JavaScript reliably, has a complete page.
 *
 * Not full server-side rendering: the React app is unchanged and this is one
 * file. It is the smallest thing that puts real content in front of a
 * crawler, which is the whole problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPages, SITE } from './seoContent.js';

/* ⚠️ From this file, not from the working directory. pm2 starts the app in
   backend/, so a cwd-relative path was one level off and every read failed
   silently — the middleware fell through exactly as designed, which is why
   nothing broke and nothing worked. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../../frontend/dist/index.html');

/** Anything a visitor types becomes text, never markup. */
const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function headFor(page) {
  const url = SITE + page.path;
  const bits = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="iwopo">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE}/og-cover.jpg">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];

  /* A breadcrumb on a sub-page, which is what turns a result into a path
     rather than a bare URL. */
  if (page.path.startsWith('/features/')) {
    bits.push(`<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'iwopo', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Features', item: SITE + '/features' },
        { '@type': 'ListItem', position: 3, name: page.h1, item: url },
      ],
    })}</script>`);
  }

  /* Questions and answers, which Google shows directly in results. */
  if (page.faq?.length) {
    bits.push(`<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    })}</script>`);
  }

  return bits.join('\n  ');
}

function bodyFor(page) {
  const parts = [`<h1>${esc(page.h1)}</h1>`];
  for (const p of (page.body || [])) parts.push(`<p>${esc(p)}</p>`);
  if (page.list?.length) {
    parts.push('<ul>' + page.list.map(i =>
      `<li><a href="${esc(i.href)}">${esc(i.name)}</a> — ${esc(i.description)}</li>`).join('') + '</ul>');
  }
  if (page.faq?.length) {
    parts.push('<h2>Questions</h2>');
    for (const [q, a] of page.faq) parts.push(`<h3>${esc(q)}</h3><p>${esc(a)}</p>`);
  }
  return parts.join('\n    ');
}

/**
 * Express middleware. Falls through untouched if anything is wrong — a
 * failure here must never take the site down, and a page without its
 * pre-rendered copy still works perfectly for a human.
 */
export function seoMiddleware() {
  return async (req, res, next) => {
    try {
      if (req.method !== 'GET') return next();
      const accept = String(req.headers.accept || '');
      if (!accept.includes('text/html')) return next();

      const pages = await allPages();
      const page = pages.find(p => p.path === req.path);
      if (!page) return next();

      let html;
      try { html = fs.readFileSync(DIST, 'utf8'); }
      catch { return next(); }                    // not built — let nginx answer

      /* Replace the static head and fill the empty root. */
      html = html
        .replace(/<title>[\s\S]*?<\/title>/, headFor(page))
        .replace(/<meta name="description"[^>]*>/g, '')
        .replace(/<link rel="canonical"[^>]*>/g, '')
        .replace(/<meta property="og:[^>]*>/g, '')
        .replace(/<meta name="twitter:[^>]*>/g, '')
        .replace('<div id="root"></div>',
          `<div id="root">\n    ${bodyFor(page)}\n  </div>`);

      res.type('html').send(html);
    } catch { next(); }
  };
}
