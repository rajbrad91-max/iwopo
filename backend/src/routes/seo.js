/**
 * 🔎 robots.txt, sitemap.xml and llms.txt for iwopo.com.
 *
 * ⚠️ Served by EXPRESS, before the SPA fallback (nginx sends these paths here).
 *
 * Staging (alphabetaone.com) is a full copy of iwopo.com. Until 2026-10-31 it told search engines to index it —
 * duplicate content that splits ranking with the real site. Any host other than iwopo.com now says "Disallow: /"
 * (nginx adds X-Robots-Tag: noindex there too).
 */
import express from 'express';
import { allPages, SITE } from '../lib/seoContent.js';

const router = express.Router();
const isLive = (req) => /^(www\.)?iwopo\.com$/i.test(String(req.hostname || ''));

/**
 * GET /robots.txt — the panel, admin area and every client-facing link stay out of search: a gallery or a portal
 * is somebody's wedding. AI crawlers are welcome on the marketing pages (that is how assistants learn about iwopo).
 */
router.get('/robots.txt', (req, res) => {
  /* Staging: crawlers may come in — every answer carries X-Robots-Tag: noindex (nginx), and a crawler has to SEE
     that to drop pages it already knows. "Disallow: /" would hide the noindex and keep the old copies listed. */
  if (!isLive(req)) return res.type('text/plain').send('User-agent: *\nAllow: /\n');
  res.type('text/plain').send(`User-agent: *
Disallow: /panel
Disallow: /admin
Disallow: /api/
Disallow: /g/
Disallow: /gallery/
Disallow: /live/
Disallow: /f/
Disallow: /portal
Disallow: /sign/
Disallow: /invoice/
Disallow: /certificate/
Disallow: /contract-preview
Disallow: /checkin
Disallow: /reset
Disallow: /reset-password
Disallow: /verify
Disallow: /editor
Disallow: /knowledge/
Disallow: /x/

Sitemap: ${SITE}/sitemap.xml
`);
});

/** GET /sitemap.xml — the same list the pages are built from, so it can never offer a URL that does not render. */
router.get('/sitemap.xml', async (req, res) => {
  try {
    const all = await allPages();
    const urls = all.map(p => `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${p.updated}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);
  } catch (e) { res.status(500).type('text/plain').send(e.message); }
});

/**
 * GET /llms.txt — a short, plain map of iwopo for AI assistants (ChatGPT, Perplexity, Gemini, Claude), following
 * the llms.txt convention. GET /llms-full.txt — the same pages with their full text.
 */
async function llms(full) {
  const pages = await allPages();
  const home = pages.find(p => p.path === '/');
  const group = (kind) => pages.filter(p => p.kind === kind);
  const line = (p) => `- [${p.h1}](${SITE}${p.path}): ${p.description}`;
  const body = (p) => [
    `## ${p.h1}`, `URL: ${SITE}${p.path}`, '', p.lead || '', ...(p.body || []),
    ...(p.plans || []).map(x => `- ${x.name}: ${x.price}/month, ${x.storage} GB storage, every feature included`),
    ...(p.sections || []).flatMap(s => [`### ${s.h2}`, ...(s.p || []), ...(s.ul || []).map(u => `- ${u}`)]),
    ...(p.faq || []).flatMap(([q, a]) => [`Q: ${q}`, `A: ${a}`]), '',
  ].join('\n');
  const out = [
    '# iwopo', '', `> ${home.description}`, '',
    home.body.join(' '), '',
    '## Features', ...group('feature').map(line), '',
    '## Who it is for', ...group('audience').map(line), '',
    '## Guides', ...group('guide').map(line), '',
    '## Countries', ...group('location').map(line), ...group('local').map(p => `- [${p.h1}](${SITE}${p.path}) (${p.langName}): ${p.description}`), '',
    '## Comparisons', ...group('compare').map(line), '',
    '## Other languages', ...group('intl').map(p => `- [${p.langName}](${SITE}${p.path}): ${p.description}`), '',
    '## Pricing', line(pages.find(p => p.path === '/pricing')), '',
    '## Questions', ...home.faq.map(([q, a]) => `- ${q} ${a}`), '',
  ];
  if (full) out.push('---', '', ...pages.filter(p => p.standalone).map(body));
  return out.join('\n');
}
/* ⚡ IndexNow (Bing, Yandex, Seznam, Naver…): the key file proves the pings come from us. Key in .env INDEXNOW_KEY. */
router.get(/^\/([a-f0-9]{32})\.txt$/, (req, res, next) => {
  const key = process.env.INDEXNOW_KEY;
  if (!key || req.params[0] !== key) return next();
  res.type('text/plain').send(key);
});

router.get('/llms.txt', async (req, res) => {
  try { res.type('text/plain; charset=utf-8').send(await llms(false)); } catch (e) { res.status(500).type('text/plain').send(e.message); }
});
router.get('/llms-full.txt', async (req, res) => {
  try { res.type('text/plain; charset=utf-8').send(await llms(true)); } catch (e) { res.status(500).type('text/plain').send(e.message); }
});

export default router;
