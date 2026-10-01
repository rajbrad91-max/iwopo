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
import prisma from '../config/prisma.js';

const router = express.Router();

const SITE = 'https://iwopo.com';

/* The marketing pages, each aimed at something a photographer actually types
   into Google. Slugs are deliberate: "wedding photo gallery software" is a
   search; "galleries" is not. */
export const PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.9', changefreq: 'weekly' },
  { path: '/features', priority: '0.9', changefreq: 'weekly' },
];

/** Feature pages, built from what is actually on sale. */
export async function featurePages() {
  const rows = await prisma.services.findMany({
    where: { is_live: true, is_private: false },        // 🔒 private features never listed
    select: { feature_key: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    path: '/features/' + r.feature_key,
    name: r.name,
    description: r.description || '',
    priority: '0.8',
    changefreq: 'monthly',
  }));
}

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
    /* ⚠️ Only pages that actually exist. The feature pages are listed in
       featurePages() ready for when they are built, but submitting a URL that
       is not there is worse than not submitting it: Google records a soft 404
       against the whole site and trusts the rest of the sitemap less. */
    const all = [...PAGES];
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
