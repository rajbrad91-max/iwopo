/**
 * 🔎 "For …" pages — the people iwopo is built for, in the words they search with. Worldwide wording, US English.
 * Every claim is something the product does today (checked 2026-10-31).
 */
export const AUDIENCES = {
  'wedding-photographers': {
    search: 'Software for wedding photographers',
    h1: 'All-in-one software for wedding photographers',
    lead: 'Inquiries, contracts, deposits, bookings, galleries and your website in one place — so the business side of a wedding takes minutes, not evenings.',
    sections: [
      { h2: 'The admin that eats your week, handled', p: [
        'A typical wedding photographer pays for a gallery service, a contract tool, a CRM, a website builder and a file transfer service — and spends evenings copying the same couple’s details between them. iwopo is one system where a couple’s details are entered once, by them, and used everywhere after that.',
      ] },
      { h2: 'From inquiry to gallery delivery', ul: [
        'A couple fills in your inquiry form, including every pre-event and getting-ready location.',
        'You send them a folder of packages; they choose in their own portal.',
        'Their contract fills itself in, they initial and sign it, and pay the deposit.',
        'The booking lands on your calendar with your crew assigned.',
        'After the wedding, you deliver a gallery where guests can find their own photos.',
      ] },
      { h2: 'Built around how weddings really work', p: [
        'Weddings are not one-hour sessions. iwopo handles long days that run past midnight, multiple events across several days, getting-ready coverage for each side, and pre-wedding shoots — and shows all of it in the contract so nothing is disputed later.',
      ] },
      { h2: 'Wherever you work', p: [
        'iwopo runs in the browser on any computer or phone. Each business sets its own time zone and currency, so it works the same for a photographer in Toronto, London, Sydney or Dubai.',
      ] },
    ],
    faq: [
      ['Do I need to switch everything at once?', 'No. Many photographers start with inquiries and contracts, then move galleries and their website over when they are ready.'],
      ['Does it work on my phone?', 'Yes. The whole panel works on a phone, which is where most inquiries are answered.'],
      ['Is there a free trial?', 'Yes. You can start a free trial without a card.'],
    ],
    related: ['/features/galleries', '/features/contracts', '/guides/wedding-photography-contract', '/pricing'],
  },

  'wedding-videographers': {
    search: 'Software for wedding videographers',
    h1: 'Booking and delivery software for wedding videographers',
    lead: 'Quote, contract and book films without the paperwork, then deliver huge files with links that never expire.',
    sections: [
      { h2: 'Contracts that understand video', p: [
        'Highlight films, next-day edits, drone coverage and live streaming each come with their own terms. iwopo adds those clauses to a contract only when the chosen package includes them, so every couple signs exactly what they bought.',
      ] },
      { h2: 'Deliver films that are measured in gigabytes', p: [
        'File Flyer sends full-quality films and raw footage from your own storage, with a download page your clients can use and links that keep working.',
      ] },
      { h2: 'Crew for every shoot', p: [
        'Assign second shooters and assistants to each booking and let them check in on the day, without a group chat.',
      ] },
    ],
    faq: [
      ['Can I send 4K films and raw footage?', 'Yes. File Flyer is built for very large files and is limited by your storage rather than a small per-file cap.'],
      ['Can a contract include drone or live-stream terms?', 'Yes. Add those clauses to your template and they appear only when the chosen package includes them.'],
    ],
    related: ['/features/fileflyer', '/features/contracts', '/features/crew', '/pricing'],
  },

  'photo-and-video-studios': {
    search: 'Studio management software for photo and video teams',
    h1: 'Run a photo and video studio from one place',
    lead: 'Several shooters, many weddings a weekend, and one system that keeps inquiries, contracts, crew, calendars and deliveries straight.',
    sections: [
      { h2: 'Everyone on the same calendar', p: [
        'Bookings, crew assignments and check-ins share one calendar, so the whole team sees the weekend at a glance and double bookings show up before they happen.',
      ] },
      { h2: 'Consistent paperwork', p: [
        'Keep separate contract templates for each event type and let iwopo fill them in. Every client receives the same professional agreement, whoever handled the inquiry.',
      ] },
      { h2: 'Delivery at volume', ul: [
        'Galleries with automatic face grouping, so large weddings stay easy to browse.',
        'Large-file transfers for films and raw footage.',
        'One client record from first inquiry to final delivery.',
      ] },
    ],
    faq: [
      ['Can crew see client prices or contracts?', 'No. Crew see only the bookings they are assigned to.'],
    ],
    related: ['/features/crew', '/features/calendar', '/guides/managing-a-wedding-photography-team', '/pricing'],
  },

  'south-asian-weddings': {
    search: 'Software for Indian and South Asian wedding photographers',
    h1: 'Built for multi-day South Asian weddings',
    lead: 'Mehndi, Haldi, Sangeet, Jaggo, Maiyan, the wedding and the reception — each with its own date, times, venue and guests, from the inquiry form to the signed contract.',
    sections: [
      { h2: 'One wedding, many events', p: [
        'Indian, Punjabi, Sikh, Pakistani, Bangladeshi, Sri Lankan and Nepali weddings often run across several days and venues. Most booking tools assume one event with one start time. iwopo lets a couple add every pre-event to their inquiry, each with its own date, start and end time, location, guest count and service.',
      ] },
      { h2: 'Every event in the contract', p: [
        'The contract schedule lists each event with its hours, so the family, the couple and your team all agree on what is covered. Getting-ready coverage for each side is recorded with its location, and a pre-wedding shoot appears as its own item.',
      ] },
      { h2: 'Hours worked out for you', p: [
        'Hours are calculated from each event’s start and end times — including events that end after midnight — so quotes and overtime are based on the real schedule.',
      ] },
      { h2: 'Used wherever South Asian weddings happen', p: [
        'From Canada, the UK, the US and Australia to the Gulf and South Asia itself, iwopo works in any time zone and lets each business set its own currency.',
      ] },
    ],
    faq: [
      ['Can couples add events like Mehndi or Sangeet to the inquiry?', 'Yes. They add each pre-event with its own date, times, location, guests and service, or type their own event name.'],
      ['Do all the events appear in the contract?', 'Yes. The contract schedule lists the main event, getting-ready coverage, a pre-wedding shoot and every pre-event with their hours.'],
      ['Can I cover only one side of the family?', 'Yes. Coverage can be set to both sides, the bride’s side or the groom’s side.'],
    ],
    related: ['/features/leads', '/features/contracts', '/guides/wedding-photography-inquiry-form', '/for/wedding-photographers'],
  },
};
