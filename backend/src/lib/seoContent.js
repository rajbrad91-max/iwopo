/**
 * 🔎 Every marketing page of iwopo.com, in one list — the single place a page is added.
 *
 * The sitemap, llms.txt, the head tags and the crawlable pages all read from allPages(), so they can never drift
 * apart. The words live in ./seo/{features,audiences,guides}.js.
 *
 * ⚠️ NOTHING here hardcodes a price or a plan name: plans are read from the database at request time. A page
 * quoting last quarter's price is a public, indexed, wrong claim about your own product.
 *
 * Worldwide (2026-10-31): US English (the largest search market), no country-specific claims, and every page is
 * a real standalone page — the React app answers unknown paths with the home landing, so before this Google
 * rendered /pricing and every /features page as a copy of the home page.
 */
import prisma from '../config/prisma.js';
import { FEATURES } from './seo/features.js';
import { AUDIENCES } from './seo/audiences.js';
import { GUIDES } from './seo/guides.js';
import { LOCATIONS } from './seo/locations.js';
import { COMPARISONS } from './seo/compare.js';
import { INTL } from './seo/intl.js';
import { LOCAL } from './seo/localCountries.js';
import { IMAGES } from './seo/images.js';
import { LEGAL, LEGAL_UPDATED } from './seo/legal.js';
import { HOME_FAQ } from '../../../shared/homeFaq.js';   // ❓ the same list the home page shows

const SITE = 'https://iwopo.com';
const UPDATED = '2026-10-31';   // when the marketing copy last changed — the sitemap's lastmod

export const TAGLINE = 'Run your whole wedding business in one place';
export const BLURB =
  'Inquiries, contracts, deposits, bookings, client galleries, crew scheduling and a portfolio website — ' +
  'one platform for wedding photographers and videographers worldwide.';


const crumb = (...pairs) => pairs.map(([name, path]) => ({ name, path }));

/** Every page, with everything needed to render it, list it and describe it to AI assistants. */
/** 🚪 Pages that went (Raj, 2026-11-15: their panel pictures were out of date): a permanent redirect to the home page's own
 *  section, so old links and Google's copy still land somewhere useful (routes/seo.js). */
export const GONE = { '/features': '/#explore', '/pricing': '/#packages' };

export async function allPages() {
  const services = await prisma.services.findMany({
    where: { is_live: true, is_private: false },   // 🔒 private features never surface
    select: { feature_key: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
  const plans = await prisma.plans.findMany({
    select: { name: true, price_monthly: true, storage_gb: true , price_annual: true},
    orderBy: { price_monthly: 'asc' },
  });

  const pages = [];

  /* 🏠 The home page stays the designed React landing; this only feeds its head and its crawlable copy. */
  pages.push({
    path: '/', kind: 'home', standalone: false,
    title: `iwopo — ${TAGLINE} | Software for wedding photographers`,
    description: BLURB,
    h1: TAGLINE,
    body: [
      'iwopo brings together the parts of a wedding business that usually live in five different apps: inquiry forms, contracts with e-signatures, deposits and invoices, bookings and a calendar, crew scheduling, client photo galleries, large-file delivery and a portfolio website.',
      'A couple’s details are entered once — by them — and used everywhere after that: in their contract, on your calendar, in their gallery. Built for wedding photographers and videographers worldwide.',
    ],
    faq: HOME_FAQ,
    priority: '1.0', changefreq: 'weekly',
  });

  /* ✨ One page per live, public feature that has words written for it. The features hub went on 2026-11-15 (its
     panel picture was out of date): /features now leads to the home page's own feature tour (GONE, below). */
  const featureList = services.filter(s => FEATURES[s.feature_key]);
  const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;   // 💳 a plan's price, as the pages in other languages show it
  for (const s of featureList) {
    const f = FEATURES[s.feature_key];
    pages.push({
      path: '/features/' + s.feature_key, kind: 'feature', standalone: true,
      title: `${f.search} | iwopo`,
      description: f.lead.slice(0, 158),
      h1: f.h1, lead: f.lead, sections: f.sections, faq: f.faq, related: f.related,
      crumbs: crumb(['Home', '/'], [s.name, '/features/' + s.feature_key]),
      priority: '0.8', changefreq: 'monthly',
    });
  }

  /* 🎯 Who it is for. */
  for (const [slug, a] of Object.entries(AUDIENCES)) {
    pages.push({
      path: '/for/' + slug, kind: 'audience', standalone: true,
      title: `${a.search} | iwopo`,
      description: a.lead.slice(0, 158),
      h1: a.h1, lead: a.lead, sections: a.sections, faq: a.faq, related: a.related,
      crumbs: crumb(['Home', '/'], [a.h1, '/for/' + slug]),
      priority: '0.8', changefreq: 'monthly',
    });
  }

  /* 📚 Guides hub + guides. */
  pages.push({
    path: '/guides', kind: 'hub', standalone: true,
    title: 'Guides for wedding photographers and videographers | iwopo',
    description: 'Practical guides on wedding photography contracts, deposits, inquiry forms, photo delivery and running a team.',
    h1: 'Guides for wedding photographers and videographers',
    lead: 'Practical, plain-English answers to the business questions every wedding photographer and videographer runs into.',
    list: Object.entries(GUIDES).map(([slug, g]) => ({ name: g.h1, text: g.lead, href: '/guides/' + slug })),
    crumbs: crumb(['Home', '/'], ['Guides', '/guides']),
    priority: '0.7', changefreq: 'monthly',
  });
  for (const [slug, g] of Object.entries(GUIDES)) {
    pages.push({
      path: '/guides/' + slug, kind: 'guide', standalone: true,
      title: `${g.title} | iwopo`,
      description: g.lead.slice(0, 158),
      h1: g.h1, lead: g.lead, sections: g.sections, faq: g.faq, related: g.related, updated: g.updated,
      crumbs: crumb(['Home', '/'], ['Guides', '/guides'], [g.h1, '/guides/' + slug]),
      priority: '0.7', changefreq: 'monthly',
    });
  }

  /* 🌍 Countries — each written for its own market (see seo/locations.js on doorway pages). */
  pages.push({
    path: '/locations', kind: 'hub', standalone: true,
    title: 'Wedding photography software around the world | iwopo',
    description: 'iwopo for wedding photographers and videographers worldwide — North America, the UK and Ireland, Europe, Latin America, Australia and New Zealand, South Asia, the Gulf, Southeast Asia and South Africa.',
    h1: 'Wedding photography business software, wherever you work',
    lead: 'iwopo runs in any browser, in your own time zone and currency. Here is how it fits the weddings, payments and rules of each market.',
    list: [
      ...Object.entries(LOCATIONS).map(([slug, l]) => ({ name: l.country, text: l.lead, href: '/locations/' + slug })),
      ...Object.entries(LOCAL).map(([path, l]) => ({ name: `${l.country} (${INTL[l.lang].name})`, text: l.lead, href: path })),
    ],
    crumbs: crumb(['Home', '/'], ['Countries', '/locations']),
    priority: '0.7', changefreq: 'monthly',
  });
  for (const [slug, l] of Object.entries(LOCATIONS)) {
    pages.push({
      path: '/locations/' + slug, kind: 'location', standalone: true, country: l.country, countryCode: l.code,
      title: `Wedding photography software in ${l.country} | iwopo`,
      description: l.lead.slice(0, 158),
      h1: l.h1, lead: l.lead, sections: l.sections, faq: l.faq,
      related: ['/features/contracts', '/features/leads', '/features/galleries'],
      crumbs: crumb(['Home', '/'], ['Countries', '/locations'], [l.country, '/locations/' + slug]),
      priority: '0.7', changefreq: 'monthly',
    });
  }

  /* ⚖️ Comparisons — verified facts only (see seo/compare.js). */
  for (const [slug, c] of Object.entries(COMPARISONS)) {
    pages.push({
      path: '/compare/' + slug, kind: 'compare', standalone: true,
      title: `${c.title} | iwopo`,
      description: c.lead.slice(0, 158),
      h1: c.h1, lead: c.lead, sections: c.sections, faq: c.faq, related: c.related,
      crumbs: crumb(['Home', '/'], ['Compare', '/compare/' + slug], [c.h1, '/compare/' + slug]).slice(0, 1).concat(crumb([c.h1, '/compare/' + slug])),
      priority: '0.7', changefreq: 'monthly',
    });
  }

  /* 🌐 Translated landing pages — each names the English home and every other translation (hreflang). */
  const langSet = [{ lang: 'en', path: '/' }, ...Object.entries(INTL).map(([lang, t]) => ({ lang, path: t.path }))];
  pages.find(p => p.path === '/').alternates = langSet;
  for (const [lang, t] of Object.entries(INTL)) {
    pages.push({
      path: t.path, kind: 'intl', standalone: true, lang, locale: t.locale, labels: t.labels, langName: t.name,
      title: t.title, description: t.description, h1: t.h1, lead: t.lead, sections: t.sections, faq: t.faq,
      plans: plans.map(p => ({ name: p.name, price: money(p.price_monthly), annual: p.price_annual != null ? money(p.price_annual) : null, storage: p.storage_gb })),
      list: Object.entries(LOCAL).filter(([, l]) => l.lang === lang).map(([path, l]) => ({ name: l.h1, text: l.lead, href: path })),
      alternates: langSet,
      priority: '0.8', changefreq: 'monthly',
    });
  }

  /* 🌍 Country pages in their own language (seo/localCountries.js). hreflang only links pages that are versions of
     each other (es-ES ↔ es-MX); no x-default — there is no English version of "Deutschland". */
  for (const [path, l] of Object.entries(LOCAL)) {
    const t = INTL[l.lang];
    pages.push({
      path, kind: 'local', standalone: true, lang: l.hreflang, locale: l.locale, labels: t.labels, langName: t.name,
      country: l.country, countryCode: l.code,
      title: l.title, description: l.description, h1: l.h1, lead: l.lead, sections: l.sections, faq: l.faq,
      alternates: Object.entries(LOCAL).filter(([, o]) => o.lang === l.lang).map(([p, o]) => ({ lang: o.hreflang, path: p })),
      xDefault: false,
      crumbs: crumb(['iwopo', t.path], [l.country, path]),
      priority: '0.7', changefreq: 'monthly',
    });
  }

  /* ⚖️ Terms, Privacy, Refunds, Cookies (lib/seo/legal.js) */
  for (const l of Object.values(LEGAL)) pages.push({ ...l, kind: 'legal', standalone: true, updated: LEGAL_UPDATED, priority: '0.3', changefreq: 'yearly' });

  for (const p of pages) { p.updated = p.updated || UPDATED; p.images = IMAGES[p.path] || (['/locations/united-states', '/locations/canada'].includes(p.path) ? IMAGES['/for/wedding-photographers'] : undefined); }
  return pages;
}

export { SITE };
