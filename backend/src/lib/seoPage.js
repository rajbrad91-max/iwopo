/**
 * 🔎 A marketing page of iwopo.com as complete HTML — readable by Google, Bing and AI crawlers without JavaScript.
 *
 * Why standalone (2026-10-31): the React app answers any path it does not know with the home landing. Google
 * renders JavaScript, so it saw /pricing and every /features page as a copy of the home page — whatever the
 * pre-rendered HTML said. These pages are therefore served whole by Express, with no app bundle at all: fast,
 * stable, and the same for every visitor and every crawler.
 *
 * Styling lives in /mkt.css (the Content-Security-Policy blocks inline styles and scripts; JSON-LD is data, not
 * script, and is fine).
 */
import { SITE } from './seoContent.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

const ORG = {
  '@type': 'Organization', '@id': `${SITE}/#org`, name: 'iwopo', url: `${SITE}/`,
  logo: `${SITE}/iwopo-512.png`,
};

/** Structured data: who publishes it, what it is, where it sits, the questions it answers. */
function schema(page, pages) {
  const url = SITE + page.path;
  const graph = [ORG, { '@type': 'WebSite', '@id': `${SITE}/#site`, url: `${SITE}/`, name: 'iwopo', publisher: { '@id': `${SITE}/#org` }, inLanguage: 'en' }];
  const webPage = {
    '@type': page.kind === 'guide' ? 'Article' : 'WebPage', '@id': `${url}#page`, url,
    name: page.title, headline: page.h1, description: page.description, inLanguage: 'en',
    isPartOf: { '@id': `${SITE}/#site` }, dateModified: page.updated,
    ...(page.kind === 'guide' ? { author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` }, datePublished: page.updated, mainEntityOfPage: url } : {}),
  };
  graph.push(webPage);
  if (page.kind === 'feature' || page.kind === 'pricing' || page.kind === 'audience' || page.kind === 'location') {
    graph.push({
      '@type': 'SoftwareApplication', name: 'iwopo', url: `${SITE}/`,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      description: pages.find(p => p.path === '/')?.description,
      publisher: { '@id': `${SITE}/#org` },
      ...(page.country ? { areaServed: { '@type': 'Country', name: page.country, identifier: page.countryCode } } : {}),
    });
  }
  if (page.crumbs?.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: page.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + c.path })),
    });
  }
  if (page.faq?.length) {
    graph.push({
      '@type': 'FAQPage', mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  }
  return ld({ '@context': 'https://schema.org', '@graph': graph });
}

/** The <head> every marketing page shares. */
export function headTags(page, pages) {
  const url = SITE + page.path;
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`,
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="en" href="${url}">`,
    `<link rel="alternate" hreflang="x-default" href="${url}">`,
    `<meta property="og:type" content="${page.kind === 'guide' ? 'article' : 'website'}">`,
    `<meta property="og:site_name" content="iwopo">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE}/og-cover.jpg">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    schema(page, pages),
  ].join('\n  ');
}

const link = (pages, path) => { const p = pages.find(x => x.path === path); return p ? `<a href="${path}">${esc(p.h1)}</a>` : ''; };

function sectionHtml(s) {
  return `<section>\n      <h2>${esc(s.h2)}</h2>\n`
    + (s.p || []).map(t => `      <p>${esc(t)}</p>\n`).join('')
    + (s.ul?.length ? `      <ul>${s.ul.map(t => `<li>${esc(t)}</li>`).join('')}</ul>\n` : '')
    + '    </section>';
}

/** The complete page. */
export function renderPage(page, pages) {
  const feats = pages.filter(p => p.kind === 'feature');
  const auds = pages.filter(p => p.kind === 'audience');
  const guides = pages.filter(p => p.kind === 'guide');
  const places = pages.filter(p => p.kind === 'location');
  const crumbs = page.crumbs?.length
    ? `<nav class="mk-crumbs" aria-label="Breadcrumb">${page.crumbs.map((c, i) => i === page.crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${c.path}">${esc(c.name)}</a>`).join(' <span aria-hidden="true">›</span> ')}</nav>` : '';
  const plans = page.plans?.length
    ? `<div class="mk-plans">${page.plans.map(p => `<div class="mk-plan"><h3>${esc(p.name)}</h3><p class="mk-price">${esc(p.price)}<span>/month</span></p><p>${esc(p.storage)} GB storage · every feature included</p><a class="mk-btn" href="/#signup">Start free trial</a></div>`).join('')}</div>` : '';
  const list = page.list?.length
    ? `<ul class="mk-cards">${page.list.map(i => `<li><a href="${i.href}"><h2>${esc(i.name)}</h2><p>${esc(i.text)}</p></a></li>`).join('')}</ul>` : '';
  const faq = page.faq?.length
    ? `<section class="mk-faq"><h2>Frequently asked questions</h2>${page.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>` : '';
  const related = page.related?.length
    ? `<aside class="mk-related"><h2>Related</h2><ul>${page.related.map(r => `<li>${link(pages, r)}</li>`).join('')}</ul></aside>` : '';
  const updated = page.kind === 'guide' ? `<p class="mk-updated">Updated ${new Date(page.updated + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/mkt.css">
  ${headTags(page, pages)}
</head>
<body class="mk">
  <header class="mk-top">
    <div class="mk-wrap mk-bar">
      <a class="mk-logo" href="/"><img src="/iwopo-logo.png" alt="iwopo" width="32" height="32"><span>iwopo</span></a>
      <nav class="mk-nav" aria-label="Main">
        <a href="/features">Features</a><a href="/pricing">Pricing</a><a href="/guides">Guides</a><a href="/login">Log in</a>
        <a class="mk-btn mk-btn-sm" href="/#signup">Start free trial</a>
      </nav>
    </div>
  </header>
  <main class="mk-wrap mk-main">
    ${crumbs}
    <article>
      <h1>${esc(page.h1)}</h1>
      ${updated}
      <p class="mk-lead">${esc(page.lead || page.description)}</p>
      ${plans}
      ${list}
      ${(page.sections || []).map(sectionHtml).join('\n    ')}
      ${faq}
    </article>
    <section class="mk-cta">
      <h2>Run your whole wedding business in one place</h2>
      <p>Free trial · No card required · Cancel anytime</p>
      <a class="mk-btn" href="/#signup">Start free trial</a>
    </section>
    ${related}
  </main>
  <footer class="mk-foot">
    <div class="mk-wrap mk-cols">
      <div><h2>Features</h2><ul>${feats.map(p => `<li><a href="${p.path}">${esc(p.crumbs.at(-1).name)}</a></li>`).join('')}</ul></div>
      <div><h2>Who it’s for</h2><ul>${auds.map(p => `<li><a href="${p.path}">${esc(p.h1)}</a></li>`).join('')}</ul></div>
      <div><h2>Guides</h2><ul>${guides.map(p => `<li><a href="${p.path}">${esc(p.h1)}</a></li>`).join('')}</ul></div>
      <div><h2>Countries</h2><ul>${places.map(p => `<li><a href="${p.path}">${esc(p.country)}</a></li>`).join('')}</ul></div>
      <div><h2>iwopo</h2><ul><li><a href="/">Home</a></li><li><a href="/pricing">Pricing</a></li><li><a href="/features">All features</a></li><li><a href="/login">Log in</a></li></ul></div>
    </div>
    <p class="mk-wrap mk-copy">© ${new Date().getFullYear()} iwopo</p>
  </footer>
</body>
</html>`;
}
