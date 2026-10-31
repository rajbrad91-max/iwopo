/**
 * 🌍 Country pages — wedding photography and videography business software, per market (2026-10-31).
 *
 * ⚠️ Google treats near-identical "software in <country>" pages as doorway pages and pushes them down. Each page here
 * is written for its own market: the wedding traditions vendors there actually shoot, how clients there usually pay,
 * the e-signature law that applies, seasons and time zones. Laws are named as general information only, never as
 * legal advice. English-language markets only — other languages need translated pages (and ideally a translated app).
 *
 * Every product claim is something iwopo does today: per-business time zone and currency, multi-event inquiries and
 * contracts, initials + e-signature with an audit record, "Pay directly" for local payment methods confirmed by the
 * vendor, galleries with face grouping, crew, calendar.
 */
const esign = (law) => `Electronic signatures are generally recognized in ${law}. iwopo records who signed, when, from which IP address and exactly what they signed, with a completion certificate. This is general information, not legal advice — check the rules for your own business.`;
const pay = (methods) => `Couples can pay your deposit the way they already pay — ${methods} — and mark it as paid in their portal. You confirm it when the money arrives, and the date is booked.`;

export const LOCATIONS = {
  'united-states': {
    country: 'United States', code: 'US',
    h1: 'Wedding photography business software for the United States',
    lead: 'From inquiry to signed contract, deposit, booking and gallery delivery — one platform for American wedding photographers and videographers, in your own time zone.',
    sections: [
      { h2: 'Built for the American wedding season', p: [
        'Most U.S. weddings cluster between late spring and early fall, with Saturdays booked a year or more ahead. iwopo keeps every inquiry, hold and booking on one calendar so a popular date is never quoted twice.',
        'Rehearsal dinners, getting-ready coverage, engagement sessions and day-after shoots each go into the inquiry and the contract as their own events, with their own times and hours.',
      ] },
      { h2: 'Contracts and deposits', p: [esign('the United States under the federal E-SIGN Act and state laws based on the UETA'), pay('Zelle, Venmo, a bank transfer or a check')] },
      { h2: 'Coast to coast', p: ['Set your business time zone and every received time, booking and signature is shown in it, with the zone labeled — whichever coast you work from.'] },
    ],
    faq: [
      ['Does iwopo work for destination weddings?', 'Yes. Each event in a booking has its own date, times and location, wherever it takes place.'],
      ['Can I keep separate contracts for weddings and other events?', 'Yes. Keep as many templates as you need, one per event type.'],
    ],
  },
  'canada': {
    country: 'Canada', code: 'CA',
    h1: 'Wedding photography business software for Canada',
    lead: 'Inquiries, contracts, deposits, bookings and galleries for Canadian wedding photographers and videographers — including the multi-day South Asian weddings common across Canada.',
    sections: [
      { h2: 'Canadian weddings, Canadian payments', p: [pay('Interac e-Transfer, a bank transfer or cash'), 'Set your currency and time zone and the whole panel follows it, from Vancouver to St. John’s.'] },
      { h2: 'Multi-day weddings', p: ['Large Punjabi, Indian and Pakistani weddings in British Columbia, Ontario and Alberta often run across several days. Couples add every event — Mehndi, Jaggo, Sangeet, the wedding and the reception — to their inquiry, and each one appears in the contract with its own hours.'] },
      { h2: 'Contracts', p: [esign('Canada under federal and provincial electronic commerce laws')] },
      { h2: 'A short season, booked early', p: ['With most weddings between June and September, Saturdays sell out fast. One calendar for holds and bookings keeps double bookings out.'] },
    ],
    faq: [
      ['Can clients pay by Interac e-Transfer?', 'Yes. They send it as usual, mark it as paid in their portal, and you confirm it when it arrives.'],
      ['Is iwopo available in French?', 'Not yet — iwopo’s app and pages are currently in English.'],
    ],
  },
  'united-kingdom': {
    country: 'United Kingdom', code: 'GB',
    h1: 'Wedding photography business software for the UK',
    lead: 'One place for enquiries, contracts, deposits, bookings and galleries — for wedding photographers and videographers across England, Scotland, Wales and Northern Ireland.',
    sections: [
      { h2: 'Ceremony, wedding breakfast, evening reception', p: [
        'A British wedding day often has a long timeline: preparations, the ceremony, drinks reception, wedding breakfast, speeches and an evening party. Each part can be recorded with its own times, so coverage and overtime are clear in the contract.',
        'Asian weddings in the UK — Hindu, Sikh and Muslim — often span several days, and every event gets its own date, times, venue and guest count.',
      ] },
      { h2: 'Deposits and contracts', p: [pay('a bank transfer, Faster Payments or cash'), esign('the UK under the Electronic Communications Act 2000 and the UK eIDAS regulation')] },
      { h2: 'Delivering to couples and guests', p: ['Galleries group photographs by face, so every guest can find their own pictures without the couple forwarding requests to you.'] },
    ],
    faq: [
      ['Does iwopo handle multi-day Asian weddings?', 'Yes. Each event — Mehndi, Sangeet, Nikah, Walima or reception — is its own item with date, times, venue and guests.'],
    ],
  },
  'australia': {
    country: 'Australia', code: 'AU',
    h1: 'Wedding photography business software for Australia',
    lead: 'Enquiries, contracts, deposits, bookings and galleries in one place — for wedding photographers and videographers across Australia, in your own time zone.',
    sections: [
      { h2: 'Seasons the other way round', p: ['With weddings concentrated in spring and autumn, popular Saturdays go quickly. Every enquiry and booking shares one calendar, so a taken date is visible before you quote it.'] },
      { h2: 'Payments and contracts', p: [pay('a bank transfer, PayID or cash'), esign('Australia under the Electronic Transactions Act 1999 and matching state laws')] },
      { h2: 'Big weddings, big galleries', p: ['Indian, Lebanese, Greek and other large Australian weddings can produce thousands of photos. Galleries split the day into sections and group photos by face so guests find theirs quickly.'] },
      { h2: 'Across time zones', p: ['Set your business time zone and every booking and signature is shown in it, with the zone labeled.'] },
    ],
    faq: [['Can I send large video files to couples?', 'Yes. File Flyer sends films and raw footage from your own storage with links that keep working.']],
  },
  'new-zealand': {
    country: 'New Zealand', code: 'NZ',
    h1: 'Wedding photography business software for New Zealand',
    lead: 'From enquiry to gallery delivery — one platform for New Zealand wedding photographers and videographers, from elopements to large family weddings.',
    sections: [
      { h2: 'Elopements, destination weddings and everything between', p: ['Many couples travel to New Zealand to marry in the mountains or on the coast. Each part of the day — a sunrise elopement, the ceremony, a reception — can be booked with its own location and times.'] },
      { h2: 'Payments and contracts', p: [pay('a bank transfer or cash'), esign('New Zealand under the Contract and Commercial Law Act 2017')] },
      { h2: 'Couples from overseas', p: ['Times are shown in your New Zealand time zone, clearly labeled, so an inquiry from a couple abroad never causes confusion about when the day starts.'] },
    ],
    faq: [['Does iwopo work for elopement photographers?', 'Yes. A booking can be a single short event or several, each with its own location and times.']],
  },
  'india': {
    country: 'India', code: 'IN',
    h1: 'Wedding photography business software for India',
    lead: 'Mehndi, Haldi, Sangeet, Baraat, the pheras and the reception — every function of an Indian wedding, from the inquiry to the signed contract, in one platform for photographers and cinematographers.',
    sections: [
      { h2: 'Every function, its own schedule', p: [
        'Indian weddings run across several days and venues, often with hundreds of guests. Couples add each function to their inquiry with its own date, start and end time, venue, guest count and service — photos, video or both.',
        'Hours are calculated from each function’s times, including ceremonies that end long after midnight, so quotes and overtime match the real schedule.',
      ] },
      { h2: 'Payments the way families pay', p: [pay('UPI, a bank transfer (NEFT/IMPS) or cash'), 'Each business sets its own currency.'] },
      { h2: 'Contracts with initials', p: [esign('India under the Information Technology Act, 2000'), 'Ask the family to initial the schedule of functions — the section most likely to be discussed later.'] },
      { h2: 'Galleries for very large weddings', p: ['Thousands of photos across many functions stay easy to browse in sections, and face grouping lets every relative find their own photographs.'] },
    ],
    faq: [
      ['Can I quote for each function separately?', 'Each function is recorded with its own date, times, hours, guests and service, so your quote and contract can cover exactly what was booked.'],
      ['Can families pay by UPI?', 'Yes. They pay as usual, mark it as paid in the portal, and you confirm it when it arrives.'],
    ],
  },
  'pakistan': {
    country: 'Pakistan', code: 'PK',
    h1: 'Wedding photography business software for Pakistan',
    lead: 'Dholki, Mayun, Mehndi, Barat, Nikah and Walima — every event of a Pakistani wedding, from inquiry to signed contract, in one platform for photographers and videographers.',
    sections: [
      { h2: 'Events hosted by different families', p: [
        'In a Pakistani wedding the Barat and the Walima are often hosted by different sides of the family, at different venues, on different days. Each event is recorded with its own date, times, venue, guests and service, and coverage can be set for the bride’s side, the groom’s side or both.',
      ] },
      { h2: 'Payments and contracts', p: [pay('a bank transfer, JazzCash, Easypaisa or cash'), esign('Pakistan under the Electronic Transactions Ordinance, 2002')] },
      { h2: 'Busy winter season', p: ['With so many weddings in the cooler months, dates are booked well ahead. One calendar for every inquiry and booking keeps double bookings away.'] },
    ],
    faq: [['Can I cover only one family’s events?', 'Yes. Coverage can be set to the bride’s side, the groom’s side or both, and each event is listed separately.']],
  },
  'bangladesh': {
    country: 'Bangladesh', code: 'BD',
    h1: 'Wedding photography business software for Bangladesh',
    lead: 'Paan Chini, Gaye Holud, the wedding and the Bou Bhat reception — every event of a Bangladeshi wedding in one platform, from inquiry to gallery delivery.',
    sections: [
      { h2: 'Several events, several venues', p: ['Bangladeshi weddings usually include separate holud ceremonies for each side, the wedding and a reception. Couples add each one to their inquiry with its own date, times, venue and guests, and every event appears in the contract.'] },
      { h2: 'Payments and contracts', p: [pay('bKash, Nagad, a bank transfer or cash'), esign('Bangladesh under the Information and Communication Technology Act, 2006')] },
      { h2: 'Galleries families can share', p: ['Large weddings mean large galleries. Photos are grouped by face, so relatives in Dhaka, London or Toronto can each find their own pictures.'] },
    ],
    faq: [['Can each side’s Gaye Holud be booked separately?', 'Yes. Each is its own event with its own date, times, venue and coverage.']],
  },
  'sri-lanka': {
    country: 'Sri Lanka', code: 'LK',
    h1: 'Wedding photography business software for Sri Lanka',
    lead: 'Poruwa ceremonies, Tamil Hindu weddings, homecomings and destination weddings on the coast — one platform for Sri Lankan wedding photographers and videographers.',
    sections: [
      { h2: 'Auspicious times, recorded exactly', p: ['Many Sri Lankan ceremonies follow auspicious times set in advance, down to the minute. Each event is booked with its exact start and end time, and the contract shows the schedule the family agreed.'] },
      { h2: 'Wedding and homecoming', p: ['The wedding and the homecoming are often separate days and venues. Each is its own event in the inquiry and contract, with its own hours and guest count.'] },
      { h2: 'Payments and contracts', p: [pay('a bank transfer or cash'), esign('Sri Lanka under the Electronic Transactions Act, No. 19 of 2006')] },
      { h2: 'Destination weddings', p: ['Couples flying in from abroad book from their own time zone; you see every time in yours, clearly labeled.'] },
    ],
    faq: [['Can I record a ceremony at an exact auspicious time?', 'Yes. Start and end times are set in five-minute steps for every event.']],
  },
  'nepal': {
    country: 'Nepal', code: 'NP',
    h1: 'Wedding photography business software for Nepal',
    lead: 'Multi-day Hindu and Buddhist weddings, auspicious dates and large family celebrations — one platform for Nepali wedding photographers and videographers.',
    sections: [
      { h2: 'Ceremonies across several days', p: ['Nepali weddings often include several rituals on different days and at different homes and venues. Each is recorded with its own date, times, venue, guests and service, and appears in the contract schedule.'] },
      { h2: 'Payments and contracts', p: [pay('a bank transfer, eSewa, Khalti or cash'), esign('Nepal under the Electronic Transactions Act, 2063 (2008)')] },
      { h2: 'Wedding seasons booked early', p: ['Weddings concentrate around auspicious dates, so the same days are requested by many families. One calendar of inquiries and bookings shows a taken date before you quote it.'] },
    ],
    faq: [['Can families abroad view the gallery?', 'Yes. Galleries open anywhere in a browser, and guests can find their own photos by face.']],
  },
};
