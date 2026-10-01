/**
 * 🔎 What each marketing page is, in words.
 *
 * ⚠️ NOTHING here hardcodes a price or a plan name. Packages change, and a
 * comparison page quoting last quarter's price is worse than no page at all —
 * it is a public, indexed, wrong claim about your own product. Anything that
 * moves is read from the database at request time.
 *
 * This is also the single place a new page gets added: the sitemap, the head
 * tags and the crawlable body all read from here, so they cannot drift apart.
 */
import prisma from '../config/prisma.js';

const SITE = 'https://iwopo.com';

/* The one sentence the whole site is built around. Said the way a
   photographer would say it, not the way software describes itself. */
export const TAGLINE = 'Run your whole wedding business in one place';
export const BLURB =
  'Client galleries, contracts, invoices, bookings, crew scheduling and a ' +
  'portfolio site — for wedding photographers and videographers. Start free.';

/**
 * A feature page, written from what the feature actually does.
 *
 * `search` is the phrase somebody types into Google. It drives the title and
 * the first heading, because matching the words in the query is most of what
 * a title tag is for.
 */
const FEATURES = {
  galleries: {
    search: 'Client photo gallery software',
    h1: 'Client galleries your couples actually enjoy opening',
    body: [
      'Deliver a wedding in a gallery that looks like your work rather than like software. Couples open a link, see every photograph, pick favourites and download what they want.',
      'Faces are found automatically, so a guest can see only the pictures they are in without anybody tagging a thing. Downloads come as a zip or one at a time, and the whole gallery can be handed over with a password you set.',
      'Everything is stored at full quality and served resized, so a gallery opens quickly on a phone at a reception and still prints properly months later.',
    ],
    faq: [
      ['Can clients download their photos?', 'Yes — individually or the whole gallery as a zip, at the resolution you choose.'],
      ['Can I password-protect a gallery?', 'Yes. Each gallery takes its own password, separate from your account.'],
      ['Does it work on a phone?', 'Galleries are built phone-first, which is where almost every client opens them.'],
    ],
  },
  contracts: {
    search: 'Photography contract and invoicing software',
    h1: 'Contracts signed and invoices paid, without leaving the booking',
    body: [
      'Send a contract, have it signed in a browser, and invoice from the same booking. No PDFs going back and forth, no chasing a signature by email.',
      'Templates are yours to edit, so the wording is the wording your business already uses rather than something generic bolted on.',
      'Invoices track what has been paid and what has not, against the booking they belong to.',
    ],
    faq: [
      ['Is e-signing legally valid?', 'A signed contract records who signed, when, and from where, which is what an electronic signature needs to stand up.'],
      ['Can I use my own contract wording?', 'Yes — templates are editable and yours.'],
    ],
  },
  leads: {
    search: 'Photography CRM and inquiry form',
    h1: 'Every enquiry in one place, from first message to booked',
    body: [
      'An enquiry form on your site drops straight into a list you can work through. Each lead keeps its date, venue, budget and everything said so far.',
      'When it becomes a booking it stays the same record, so nothing is retyped and nothing is lost between an email thread and a calendar.',
    ],
    faq: [
      ['Can I put the enquiry form on my own website?', 'Yes, on a site built here or embedded in one you already have.'],
    ],
  },
  fileflyer: {
    search: 'Send large photo files to clients',
    h1: 'Send a wedding, not a download link that expires',
    body: [
      'Hand over hundreds of gigabytes without a transfer service that deletes it after a week. Files sit in your storage and the link keeps working.',
      'Recipients get a page rather than a download that fails at ninety percent, and you can see whether it was collected.',
    ],
    faq: [
      ['Is there a file size limit?', 'Transfers are bounded by the storage on your plan, not by a per-file cap.'],
      ['Do links expire?', 'Only if you set an expiry. Otherwise they keep working.'],
    ],
  },
  website: {
    search: 'Photographer website builder',
    h1: 'A portfolio site that takes an afternoon, not a developer',
    body: [
      'Pick a theme, put your work in it, point your domain at it. The site carries your enquiry form and your packages, so an enquiry arrives as a lead rather than as an email.',
      'Themes are built for photography — large images, little chrome, quick on a phone.',
    ],
    faq: [
      ['Can I use my own domain?', 'Yes.'],
      ['Do I need to know anything technical?', 'No. Choosing a theme and uploading your work is the whole job.'],
    ],
  },
  crew: {
    search: 'Second shooter and crew scheduling',
    h1: 'Who is shooting what, without a group chat',
    body: [
      'Keep your second shooters, videographers and assistants in one roster, assign them to a booking, and let them check in on the day.',
      'Everybody sees where they are meant to be, which is the thing a thread of messages never quite manages.',
    ],
    faq: [
      ['Can crew see the whole booking?', 'They see what they are assigned to, not your client list.'],
    ],
  },
  calendar: {
    search: 'Photography booking calendar',
    h1: 'Every wedding, every crew member, one calendar',
    body: [
      'Bookings land on a calendar with the crew attached, so a double-booking is visible before it becomes a phone call.',
    ],
    faq: [],
  },
  chatbot: {
    search: 'AI assistant for photographers',
    h1: 'An assistant that answers enquiries while you are shooting',
    body: [
      'An assistant trained on your own packages and answers, sitting on your site and your socials, replying when you are holding a camera.',
      'It knows what you charge and what you offer, because it reads the same packages your enquiry form does.',
    ],
    faq: [
      ['Does it make things up?', 'It answers from your packages and the answers you have given it, and says it does not know rather than inventing.'],
    ],
  },
};

/** Every page, with everything needed to render and to list it. */
export async function allPages() {
  const services = await prisma.services.findMany({
    where: { is_live: true, is_private: false },   // 🔒 private features never surface
    select: { feature_key: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });

  const pages = [
    {
      path: '/',
      title: `iwopo — ${TAGLINE}`,
      description: BLURB,
      h1: TAGLINE,
      body: [
        'iwopo is one place for the parts of a wedding business that usually live in five: delivering galleries, signing contracts, invoicing, taking bookings, scheduling crew and running a portfolio site.',
        'It is built for photographers and videographers who would rather be shooting than reconciling three subscriptions.',
      ],
      priority: '1.0', changefreq: 'weekly',
    },
    {
      path: '/features',
      title: `Features — iwopo`,
      description: 'Galleries, contracts, invoices, bookings, crew, file transfer, a website builder and an AI assistant, in one subscription.',
      h1: 'Everything a wedding studio runs on',
      body: ['Each part works on its own and all of them work together, because they share the same bookings and the same clients.'],
      list: services.map(s => ({ name: s.name, description: s.description, href: '/features/' + s.feature_key })),
      priority: '0.9', changefreq: 'weekly',
    },
  ];

  for (const s of services) {
    const f = FEATURES[s.feature_key];
    if (!f) continue;                              // no page until somebody writes one
    pages.push({
      path: '/features/' + s.feature_key,
      title: `${f.search} — iwopo`,
      description: (f.body[0] || '').slice(0, 155),
      h1: f.h1,
      body: f.body,
      faq: f.faq,
      priority: '0.8', changefreq: 'monthly',
    });
  }

  /* ⚠️ Pricing is a page, but its NUMBERS come from the database at request
     time. Raj has said the packages are changing; a hardcoded price here
     would become a public, indexed, wrong claim about his own product. */
  const plans = await prisma.plans.findMany({
    select: { name: true, price_monthly: true, storage_gb: true },
    orderBy: { price_monthly: 'asc' },
  });
  pages.push({
    path: '/pricing',
    title: 'Pricing — iwopo',
    description: 'One subscription for galleries, contracts, invoices, bookings, crew and a website. Start free.',
    h1: 'One price, not five subscriptions',
    body: [
      'Most studios pay separately for galleries, for a website, for contracts and for a CRM. iwopo is one bill for all of it.',
      ...plans.map(p => `${p.name} — $${p.price_monthly} a month, ${p.storage_gb} GB of storage, every feature included.`),
    ],
    priority: '0.9', changefreq: 'weekly',
  });

  return pages;
}

export { SITE };
