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

const SITE = 'https://iwopo.com';
const UPDATED = '2026-10-31';   // when the marketing copy last changed — the sitemap's lastmod

export const TAGLINE = 'Run your whole wedding business in one place';
export const BLURB =
  'Inquiries, contracts, deposits, bookings, client galleries, crew scheduling and a portfolio website — ' +
  'one platform for wedding photographers and videographers worldwide. Start free.';

const HOME_FAQ = [
  ['What is iwopo?', 'iwopo is an all-in-one platform for wedding photographers and videographers: inquiry forms, a lead list, contracts with e-signatures, deposits, bookings, a calendar, crew scheduling, client galleries, large-file delivery and a portfolio website.'],
  ['Who is iwopo for?', 'Wedding and event photographers, videographers and studios of every size — from a solo photographer to a team covering several weddings a weekend.'],
  ['Does iwopo work outside North America?', 'Yes. It runs in any browser, and each business sets its own time zone and currency.'],
  ['Is there a free trial?', 'Yes. You can start a free trial without a card and cancel anytime.'],
  ['Is my data secure?', 'Accounts are protected by two-step sign-in on new devices, every business’s data is kept separate, and connections are encrypted.'],
];

const crumb = (...pairs) => pairs.map(([name, path]) => ({ name, path }));

/** Every page, with everything needed to render it, list it and describe it to AI assistants. */
export async function allPages() {
  const services = await prisma.services.findMany({
    where: { is_live: true, is_private: false },   // 🔒 private features never surface
    select: { feature_key: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
  const plans = await prisma.plans.findMany({
    select: { name: true, price_monthly: true, storage_gb: true },
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

  /* ✨ Features hub + one page per live, public feature that has words written for it. */
  const featureList = services.filter(s => FEATURES[s.feature_key]);
  pages.push({
    path: '/features', kind: 'hub', standalone: true,
    title: 'Features — all-in-one wedding photography software | iwopo',
    description: 'Inquiry forms, contracts with e-signatures, deposits, bookings, calendar, crew, client galleries, file delivery, a website builder and an AI assistant — in one subscription.',
    h1: 'Everything a wedding business runs on',
    lead: 'Each part works on its own, and all of them work together because they share the same clients and the same bookings.',
    list: featureList.map(s => ({ name: s.name, text: FEATURES[s.feature_key].lead, href: '/features/' + s.feature_key })),
    crumbs: crumb(['Home', '/'], ['Features', '/features']),
    priority: '0.9', changefreq: 'monthly',
  });
  for (const s of featureList) {
    const f = FEATURES[s.feature_key];
    pages.push({
      path: '/features/' + s.feature_key, kind: 'feature', standalone: true,
      title: `${f.search} | iwopo`,
      description: f.lead.slice(0, 158),
      h1: f.h1, lead: f.lead, sections: f.sections, faq: f.faq, related: f.related,
      crumbs: crumb(['Home', '/'], ['Features', '/features'], [s.name, '/features/' + s.feature_key]),
      priority: '0.8', changefreq: 'monthly',
    });
  }

  /* 💳 Pricing — the numbers come from the plans table, right now. */
  const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  pages.push({
    path: '/pricing', kind: 'pricing', standalone: true,
    title: 'Pricing — one subscription instead of five | iwopo',
    description: 'One monthly subscription for inquiries, contracts, deposits, bookings, galleries, crew, file delivery and a website. Free trial, no card required.',
    h1: 'One price, not five subscriptions',
    lead: 'Most wedding businesses pay separately for galleries, a website, contracts, a CRM and file transfers. iwopo is one subscription for all of it.',
    plans: plans.map(p => ({ name: p.name, price: money(p.price_monthly), storage: p.storage_gb })),
    sections: [
      { h2: 'Every plan includes', ul: featureList.map(s => `${s.name} — ${FEATURES[s.feature_key].h1}`) },
      { h2: 'Start free', p: ['Try iwopo with a free trial. No card is required, and you can cancel anytime.'] },
    ],
    faq: [
      ['Is there a free trial?', 'Yes. Start a free trial without a card.'],
      ['Can I cancel anytime?', 'Yes. There is no long-term contract.'],
      ['What is the difference between the plans?', 'Mainly storage. Every plan includes the features listed on this page.'],
    ],
    related: ['/features', '/for/wedding-photographers', '/for/photo-and-video-studios'],
    crumbs: crumb(['Home', '/'], ['Pricing', '/pricing']),
    priority: '0.9', changefreq: 'weekly',
  });

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
    description: 'iwopo for wedding photographers and videographers in the United States, Canada, the UK, Australia, New Zealand, India, Pakistan, Bangladesh, Sri Lanka and Nepal.',
    h1: 'Wedding photography business software, wherever you work',
    lead: 'iwopo runs in any browser, in your own time zone and currency. Here is how it fits the weddings, payments and rules of each market.',
    list: Object.entries(LOCATIONS).map(([slug, l]) => ({ name: l.country, text: l.lead, href: '/locations/' + slug })),
    crumbs: crumb(['Home', '/'], ['Countries', '/locations']),
    priority: '0.7', changefreq: 'monthly',
  });
  for (const [slug, l] of Object.entries(LOCATIONS)) {
    pages.push({
      path: '/locations/' + slug, kind: 'location', standalone: true, country: l.country, countryCode: l.code,
      title: `Wedding photography software in ${l.country} | iwopo`,
      description: l.lead.slice(0, 158),
      h1: l.h1, lead: l.lead, sections: l.sections, faq: l.faq,
      related: ['/features/contracts', '/features/leads', '/features/galleries', '/pricing'],
      crumbs: crumb(['Home', '/'], ['Countries', '/locations'], [l.country, '/locations/' + slug]),
      priority: '0.7', changefreq: 'monthly',
    });
  }

  for (const p of pages) p.updated = p.updated || UPDATED;
  return pages;
}

export { SITE };
