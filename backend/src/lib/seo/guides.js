/**
 * 🔎 Guides — useful, general answers to what wedding vendors search for. These are what Google's answer boxes
 * and AI assistants quote (AEO/GEO), so each one answers its question in the first paragraph, then goes deeper.
 * General business guidance only — never legal or tax advice — and it says so where it matters.
 */
export const GUIDES = {
  'wedding-photography-contract': {
    title: 'What to include in a wedding photography contract (checklist)',
    h1: 'What to include in a wedding photography contract',
    lead: 'A good wedding photography contract states who is booked, exactly what is covered and when, what it costs and when it is paid, what happens if plans change, and who owns the photos. Here is a practical checklist.',
    updated: '2026-10-31',
    sections: [
      { h2: '1. The parties and the booking', ul: [
        'Your business name and the client’s full names, phone and email.',
        'The event type, date and main venue.',
        'The package booked, by name, with what it includes.',
      ] },
      { h2: '2. The schedule — in detail', p: [
        'Most disputes are about time. List the start and end time of each event, the total hours, the venue and approximate guest count. For multi-day weddings, list every event separately — getting ready, pre-wedding shoot, Mehndi or rehearsal dinner, the ceremony and the reception.',
        'Ask the client to initial the schedule. It is the section they are most likely to question later.',
      ] },
      { h2: '3. Price, deposit and balance', ul: [
        'The total price and what it includes.',
        'The deposit amount, whether it is refundable, and that it secures the date.',
        'When the balance is due and how it can be paid.',
      ] },
      { h2: '4. Changes, overtime and travel', ul: [
        'The hourly rate for extra coverage, and how it is agreed on the day.',
        'What happens if the schedule or date changes.',
        'Travel and accommodation terms for distant venues.',
        'Meals and breaks for long days.',
      ] },
      { h2: '5. Cancellations and postponements', p: [
        'State clearly what happens to the deposit and any balance if the client cancels or postpones, and what you will do if you cannot attend — for example, arranging a qualified replacement or refunding fees paid.',
      ] },
      { h2: '6. Delivery, usage and copyright', ul: [
        'What is delivered, in what format, and roughly when.',
        'How long you keep the files, and that clients should keep their own copies.',
        'Who owns the copyright, and how the couple may use the images.',
        'Whether you may use images for your portfolio and social media.',
      ] },
      { h2: '7. Optional services', p: [
        'Drone coverage, live streaming and next-day edits each carry their own risks — weather, airspace rules, internet connections. Include their terms only when the package includes the service.',
      ] },
      { h2: '8. Signature', p: [
        'Electronic signatures are accepted in most countries when you can show who signed, when and how. Keep a record of the signer’s name, the time and a copy of exactly what was signed.',
        'This guide is general information, not legal advice. Have a local lawyer review your contract for where you work.',
      ] },
    ],
    faq: [
      ['Should a client initial each section of a wedding contract?', 'It is not required, but asking for initials on the schedule, payment and change terms makes it much harder to claim later that those terms were not read.'],
      ['Are e-signatures valid for wedding contracts?', 'In most countries, yes, when you can show who signed, when and how. Check the rules where you work.'],
    ],
    related: ['/features/contracts', '/guides/wedding-photography-deposit', '/for/wedding-photographers'],
  },

  'wedding-photography-deposit': {
    title: 'How much deposit should a wedding photographer take?',
    h1: 'How much deposit should a wedding photographer take?',
    lead: 'Many wedding photographers take a non-refundable deposit of roughly 25% to 50% of the package price to secure the date, with the balance due shortly before or on the wedding day. The right figure depends on how far ahead you book and what you would lose by turning other couples away.',
    updated: '2026-10-31',
    sections: [
      { h2: 'What a deposit is for', p: [
        'A wedding date can only be sold once. The deposit compensates you for turning down every other inquiry for that date, and it shows the couple is committed.',
      ] },
      { h2: 'Choosing your percentage', ul: [
        'Booking far ahead (a year or more): a higher deposit protects a date you cannot resell.',
        'High-demand dates (peak season Saturdays): consider the higher end.',
        'Smaller events or short notice: a lower deposit, or full payment upfront.',
      ] },
      { h2: 'Write it into the contract', p: [
        'State the deposit as an amount, say whether it is refundable, and say that the date is secured only once it is received. Put the balance due date in writing too.',
      ] },
      { h2: 'Make paying easy', p: [
        'The fewer steps between signing and paying, the sooner a date is secured. Ask for the deposit right after the contract is signed, and confirm the booking as soon as it arrives.',
        'This guide is general business information, not legal or tax advice.',
      ] },
    ],
    faq: [
      ['Is a wedding photography deposit refundable?', 'It is usually non-refundable because it secures a date you cannot resell, but your contract decides — state it clearly.'],
      ['When should the balance be paid?', 'Commonly a few weeks before the wedding or on the day. Whatever you choose, put the date in the contract.'],
    ],
    related: ['/guides/wedding-photography-contract', '/features/contracts', '/pricing'],
  },

  'wedding-photography-inquiry-form': {
    title: 'Wedding photography inquiry form: the questions to ask',
    h1: 'The questions a wedding photography inquiry form should ask',
    lead: 'A good inquiry form asks for contact details, the event type and date, times and venue, guest count and the service wanted — and for weddings, getting-ready locations and any pre-events — so you can quote without a second round of emails.',
    updated: '2026-10-31',
    sections: [
      { h2: 'Always ask', ul: [
        'Name, email and phone, and their role (bride, groom, parent, planner).',
        'Type of event and service (photos, video or both).',
        'Date, start and end time, and venue.',
        'Estimated guest count.',
        'How they heard about you — and who referred them, if a friend did.',
      ] },
      { h2: 'For weddings', ul: [
        'Which side or sides of the family to cover.',
        'Getting-ready coverage for each side, and where.',
        'A pre-wedding or engagement shoot.',
        'Pre-events — Mehndi, Sangeet, rehearsal dinner — each with date, times, venue and guests.',
      ] },
      { h2: 'Only ask what applies', p: [
        'Long forms lose inquiries. Show a question only when an earlier answer makes it relevant: coverage sides only for weddings, a friend’s name only when they were referred, and no guest count for a couple-only pre-wedding shoot.',
      ] },
      { h2: 'Catch mistakes before you receive them', p: [
        'Check that the end time is after the start time, the guest count is at least one and the date is not in the past. Every error caught on the form is an email you do not have to send.',
      ] },
    ],
    faq: [
      ['How long should a wedding inquiry form be?', 'As short as possible for the couple: ask the essentials, and reveal extra questions only when they apply.'],
      ['Should I ask for a budget?', 'Some photographers do; many prefer to send packages instead. If you ask, offer ranges rather than an open box.'],
    ],
    related: ['/features/leads', '/for/south-asian-weddings', '/guides/wedding-photography-contract'],
  },

  'how-to-deliver-wedding-photos': {
    title: 'How to deliver wedding photos to clients (the professional way)',
    h1: 'How to deliver wedding photos to clients',
    lead: 'Deliver wedding photos in an online gallery the couple can view on a phone, share with family and download in full quality — and keep large files, such as films, on a transfer link that does not expire.',
    updated: '2026-10-31',
    sections: [
      { h2: 'Use a gallery, not a folder', p: [
        'A gallery presents the day as a story, works on every phone, and lets the couple shortlist favorites for an album. A shared folder of files does none of that.',
      ] },
      { h2: 'Make it easy for guests', p: [
        'Guests mostly want photos of themselves. Galleries that group photos by face let each guest find theirs in seconds, which saves the couple — and you — dozens of requests.',
      ] },
      { h2: 'Full-quality downloads', ul: [
        'Offer single-photo and whole-gallery downloads.',
        'Keep originals at full resolution for printing.',
        'Split long weddings into sections: getting ready, ceremony, reception, pre-events.',
      ] },
      { h2: 'Large files and films', p: [
        'Free transfer services delete files after a few days. Send films and raw footage from storage you control, with a link that keeps working.',
      ] },
      { h2: 'Tell clients to keep a copy', p: [
        'Say in your contract how long you keep files, and remind couples to download and back up their own copies.',
      ] },
    ],
    faq: [
      ['How long should I keep a client’s wedding photos?', 'Many photographers keep them for a set period stated in the contract. Whatever you choose, tell couples to keep their own copies.'],
    ],
    related: ['/features/galleries', '/features/fileflyer', '/for/wedding-videographers'],
  },

  'managing-a-wedding-photography-team': {
    title: 'Managing a wedding photography team and second shooters',
    h1: 'How to manage second shooters and a wedding team',
    lead: 'Keep your team in one place, assign people to each booking ahead of time, give them only the details they need, and have them check in on the day — instead of running everything through a group chat.',
    updated: '2026-10-31',
    sections: [
      { h2: 'One roster', p: [
        'List every second shooter, videographer and assistant once, with how to reach them. Assign them from that list to each booking.',
      ] },
      { h2: 'Share the schedule, not your business', p: [
        'Crew need times, venues and what to cover. They do not need your prices, your contracts or your client list.',
      ] },
      { h2: 'Check in on the day', p: [
        'A quick check-in from each person’s phone tells you who has arrived without a single call during the busiest hour of the day.',
      ] },
      { h2: 'Agree terms in writing', p: [
        'Set out pay, usage of images and expectations with each crew member, the same way you do with clients.',
      ] },
    ],
    faq: [
      ['Should second shooters see client contact details?', 'Only what they need for the day. Keeping client lists and prices private protects your business.'],
    ],
    related: ['/features/crew', '/features/calendar', '/for/photo-and-video-studios'],
  },
};
