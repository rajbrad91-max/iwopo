/**
 * 🔎 SEO for iwopo's own marketing site.
 *
 * ⚠️ Served by EXPRESS, before the SPA fallback. robots.txt and sitemap.xml
 * currently return the app's HTML — Google asks for a sitemap and gets a web
 * page, which is a crawl error rather than a missing file.
 *
 * Only PUBLIC features appear. The private ones are not sold to anybody, so
 * ranking for them would bring people to a page that cannot help them.
 */
import express from 'express';
import { allPages, SITE } from '../lib/seoContent.js';

const router = express.Router();

/**
 * GET /robots.txt
 *
 * The panel, the admin area and every client-facing link are disallowed: a
 * gallery is somebody's wedding and has no business in search results, and
 * indexing /panel would put a login page in front of people searching for
 * software.
 */
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /$
Allow: /pricing
Allow: /features

Disallow: /panel
Disallow: /admin
Disallow: /api/
Disallow: /g/
Disallow: /live/
Disallow: /f/
Disallow: /portal
Disallow: /checkin
Disallow: /reset

Sitemap: ${SITE}/sitemap.xml
`);
});

/** GET /sitemap.xml */
router.get('/sitemap.xml', async (req, res) => {
  try {
    /* The same list the pages themselves are built from, so the sitemap can
       never offer a URL that does not render. */
    const all = await allPages();
    const today = new Date().toISOString().slice(0, 10);
    const urls = all.map(p => `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${today}</lastmod>
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

export default router;
