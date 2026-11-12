/**
 * ⚖️ Comparison pages. iwopo never names a competitor (Raj, 2026-11-12): these pages compare iwopo with other studio
 * software and with separate tools in general, and say only what is true of iwopo. Other products may be called
 * "other studio software", "separate tools" or "competitors" — never by name. The old named page's address
 * redirects here (MOVED, used by routes/seo.js).
 */
export const COMPARISONS = {
  'iwopo-vs-other-studio-software': {
    title: 'iwopo compared with other studio software for wedding photographers',
    h1: 'iwopo compared with other studio software',
    lead: 'Many wedding photographers and videographers pay for several tools — one for inquiries and contracts, another for galleries, another for large files, another for a website — and some of the best-known studio platforms only accept businesses in a handful of countries. iwopo puts it all in one subscription and works wherever you do.',
    sections: [
      { h2: 'Available where you work', p: [
        'Before signing up for any studio software, check that it accepts businesses in your country: several popular platforms only support a few countries.',
        'iwopo works in every country. Each business sets its own time zone and currency, prices are shown in local currency in many countries, and clients can pay your deposit the way they already pay locally — then you confirm it.',
      ] },
      { h2: 'Made for weddings, not for every kind of business', p: [
        'General business tools serve consultants, coaches and designers as much as photographers. iwopo is built around weddings: multi-day events, getting-ready coverage for each side, pre-wedding shoots and pre-events such as a Mehndi or rehearsal dinner, each with its own times and hours in the contract.',
      ] },
      { h2: 'One subscription instead of several', ul: [
        'Inquiries, packages, contracts with initials and e-signature, deposits, bookings, calendar and crew.',
        'Client galleries with automatic face grouping, so guests find their own photos.',
        'Large-file delivery for films and raw footage, with links that keep working.',
        'A portfolio website on your own domain, with your inquiry form built in.',
      ] },
      { h2: 'Moving over', p: [
        'Set up your inquiry form and contract template, then run new inquiries through iwopo while existing bookings finish where they are. Essential and Pro start with a free trial, no card needed.',
      ] },
    ],
    faq: [
      ['Is iwopo available in my country?', 'Yes. iwopo works in every country, with your own time zone and currency.'],
      ['Does iwopo include client galleries and a website?', 'Yes. Galleries, large-file delivery and a website builder are included alongside inquiries, contracts, deposits and bookings.'],
      ['Can I keep my current bookings where they are?', 'Yes. Many studios run new inquiries through iwopo and let existing bookings finish in their old tools.'],
    ],
    related: ['/pricing', '/features', '/locations', '/for/south-asian-weddings'],
  },
};

/** Old comparison addresses → their replacement (a permanent redirect, so links and search results keep working). */
export const MOVED = { '/compare/honeybook-alternative': '/compare/iwopo-vs-other-studio-software' };
