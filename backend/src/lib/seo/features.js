/**
 * 🔎 Feature pages — what each part of iwopo does, in the words a vendor searches with.
 *
 * Every claim here is something the product does today (checked 2026-10-31). A feature page that promises more
 * than the product is a public, indexed, wrong claim — worse than no page. No prices anywhere: they come from
 * the plans table at request time (seoContent.js).
 */
export const FEATURES = {
  galleries: {
    search: 'Client photo gallery software for wedding photographers',
    h1: 'Client galleries your couples actually enjoy opening',
    lead: 'Deliver every wedding in a gallery that looks like your work, opens fast on a phone, and lets guests find themselves without anyone tagging a single photo.',
    sections: [
      { h2: 'A gallery that feels like your brand, not like software', p: [
        'Couples open one link and see the whole day: getting ready, the ceremony, portraits, the party. Your logo and your colors sit on top, so the gallery reads as the last chapter of your service rather than a file dump.',
        'Photos are stored at full quality and served at the right size for each screen, so a gallery opens in seconds on a phone at the reception and still downloads print-ready files months later.',
      ] },
      { h2: 'Faces found automatically', p: [
        'iwopo groups photographs by the people in them. A guest taps their own face and sees only the pictures they appear in. Nobody tags anything, and couples stop forwarding "can you find the ones of my aunt?" messages to you.',
      ] },
      { h2: 'Downloads, favorites and privacy under your control', ul: [
        'Clients download single photos or the whole gallery as a zip.',
        'Favorites let couples shortlist images for an album or prints.',
        'Each gallery can be protected separately from your account.',
        'Organize a wedding into sections — ceremony, reception, pre-events — so a 2,000-photo day stays easy to browse.',
      ] },
      { h2: 'Part of the same booking', p: [
        'The gallery belongs to the same client record as the inquiry, contract and invoice. You never re-type a name or look up an email address to send the link, and everything about one wedding stays in one place.',
      ] },
    ],
    faq: [
      ['Can clients download their photos?', 'Yes. They can download individual photos or the whole gallery as a zip file.'],
      ['Can guests find the photos they are in?', 'Yes. Faces are grouped automatically, so a guest can pick their own face and see only their photos.'],
      ['Does the gallery work on phones?', 'Galleries are built phone-first, because that is where most couples and guests open them.'],
      ['Are the original files kept at full quality?', 'Yes. Originals are stored at full quality; smaller versions are only used for fast viewing.'],
    ],
    related: ['/features/fileflyer', '/features/contracts', '/for/wedding-photographers', '/guides/how-to-deliver-wedding-photos'],
  },

  contracts: {
    search: 'Wedding photography contract and invoice software',
    h1: 'Contracts signed and invoices paid, without leaving the booking',
    lead: 'Send a contract that fills itself in from the inquiry, have it initialed and signed in any browser, take the deposit, and file the signed copy automatically.',
    sections: [
      { h2: 'Your contract, filled in for you', p: [
        'Write your agreement once as a template, section by section, in your own words. When a client chooses a package, iwopo builds their contract with the details already in place: names, phone and email, the date, start and end times, hours, venue, guest count, getting-ready locations, every pre-event, the package, the total, the deposit and the balance.',
        'Optional clauses appear only when they apply. If the chosen package includes drone coverage or live streaming, those terms are added; if not, they stay out.',
      ] },
      { h2: 'Initials where they matter, one signature at the end', p: [
        'Mark the sections a client must initial — the schedule, payment terms, changes and overtime — and they tap to initial each one before signing. The signed record keeps their name, signature, IP address and time, with a completion certificate and a document fingerprint you can download.',
      ] },
      { h2: 'Deposit, booking and invoice in one flow', ul: [
        'The client picks a package, signs, and is asked for the deposit you set.',
        'When the deposit is confirmed, the inquiry becomes a booking and lands on your calendar.',
        'An invoice is created automatically and waits for you; nothing is emailed until you choose to send it.',
        'If a client changes package after signing, they are warned first, and a new contract is raised for the new package.',
      ] },
      { h2: 'Built for real wedding schedules', p: [
        'Multi-day weddings, pre-wedding shoots and events like a Mehndi, Sangeet or rehearsal dinner each appear in the contract schedule with their own date, times, hours and guest count, so there is no argument later about what was booked.',
      ] },
    ],
    faq: [
      ['Is an electronic signature legally valid?', 'In most countries an electronic signature is valid when you can show who signed, when and how. iwopo records the signer’s name, signature, IP address and time, plus a document fingerprint. Check the rules where you work for your own situation.'],
      ['Can I use my own contract wording?', 'Yes. Templates are fully editable, section by section, and you can keep several for different event types.'],
      ['Can clients initial individual sections?', 'Yes. You choose which sections need initials; the client cannot sign until every one is initialed.'],
      ['Is the invoice sent automatically?', 'No. It is created automatically when a booking is confirmed, and you decide when to send it.'],
    ],
    related: ['/features/leads', '/guides/wedding-photography-contract', '/guides/wedding-photography-deposit', '/pricing'],
  },

  leads: {
    search: 'Wedding photography CRM and inquiry form',
    h1: 'Every inquiry in one place, from first message to booked',
    lead: 'An inquiry form that asks exactly what you need, a lead list you can actually work through, and a client portal that turns an inquiry into a signed, paid booking.',
    sections: [
      { h2: 'An inquiry form that asks the right questions', p: [
        'Build your form from ready-made questions or start from a preset. Questions can appear only when they apply: coverage sides only for weddings, a friend’s name only when someone was referred, guest count hidden for a pre-wedding shoot. Clients can add each pre-event with its own date, times, location, guests and service.',
        'The form checks what matters before it is sent — an end time before a start time, zero guests, a date in the past — so the inquiry you receive is one you can quote from.',
      ] },
      { h2: 'Leads you can work through', ul: [
        'Every inquiry arrives with the received time in your own time zone.',
        'Search by name, email, phone or event, and sort by date, event date or name.',
        'Each lead shows exactly the questions that client was asked — nothing blank, nothing missing.',
        'Send a folder of packages with one click; the client chooses in their own portal.',
      ] },
      { h2: 'From inquiry to booking without retyping', p: [
        'The client portal walks a couple through choosing a package, signing the contract and paying the deposit. Every step updates the same record, so a lead becomes a booking — with its calendar entry, contract and invoice — without you copying a single detail.',
      ] },
    ],
    faq: [
      ['Can I put the inquiry form on my own website?', 'Yes. Each vendor gets their own form link, and it works on a site built with iwopo or linked from a site you already have.'],
      ['Can the form handle multi-day weddings?', 'Yes. Clients can add pre-events such as a Mehndi, Sangeet or rehearsal dinner, each with its own date, times, location and guest count.'],
      ['Can I change the questions?', 'Yes. Add, remove and reorder questions, mark them required, and show some only when an earlier answer makes them relevant.'],
    ],
    related: ['/features/contracts', '/guides/wedding-photography-inquiry-form', '/for/south-asian-weddings', '/features/calendar'],
  },

  fileflyer: {
    search: 'Send large photo and video files to clients',
    h1: 'Send a whole wedding, not a download link that expires',
    lead: 'Hand over hundreds of gigabytes of photos and films from your own storage, with a link that keeps working and a page your client can actually use.',
    sections: [
      { h2: 'No more transfers that vanish after a week', p: [
        'Free transfer services delete files after a few days and fail on big downloads. File Flyer keeps the files in your iwopo storage, so the link keeps working until you decide otherwise.',
      ] },
      { h2: 'Made for very large files', ul: [
        'Send full-resolution photos, raw files and 4K films.',
        'Recipients get a clear download page rather than a single fragile link.',
        'Set an expiry only when you want one.',
      ] },
      { h2: 'Useful beyond clients', p: [
        'Send footage to an editor, selects to an album designer, or final films to a venue — all from the same place your bookings live.',
      ] },
    ],
    faq: [
      ['Is there a per-file size limit?', 'Transfers are limited by the storage on your plan rather than by a small per-file cap.'],
      ['Do links expire?', 'Only if you set an expiry. Otherwise they keep working.'],
    ],
    related: ['/features/galleries', '/guides/how-to-deliver-wedding-photos', '/for/wedding-videographers'],
  },

  website: {
    search: 'Website builder for wedding photographers',
    h1: 'A portfolio website that takes an afternoon, not a developer',
    lead: 'Choose a theme, add your best work, connect your own domain, and every inquiry from your site arrives as a lead in iwopo.',
    sections: [
      { h2: 'Designed for photographs', p: [
        'Themes are built for large images, quick loading on phones and very little clutter, so your work does the selling.',
      ] },
      { h2: 'Your inquiries and packages built in', p: [
        'Your inquiry form sits on your site and feeds straight into your lead list. There is no copy-pasting from an email into a spreadsheet, and no inquiry lost in a spam folder.',
      ] },
      { h2: 'Your own domain', ul: [
        'Connect a domain you already own.',
        'Pages are served securely over HTTPS.',
        'Edit text and photos in place, without code.',
      ] },
    ],
    faq: [
      ['Can I use my own domain?', 'Yes. Connect a domain you own and the site is served on it.'],
      ['Do I need technical skills?', 'No. Choosing a theme, adding photos and editing text is the whole job.'],
    ],
    related: ['/features/leads', '/for/wedding-photographers', '/features/chatbot'],
  },

  crew: {
    search: 'Second shooter and crew scheduling software',
    h1: 'Who is shooting what, without a group chat',
    lead: 'Keep second shooters, videographers and assistants in one team, assign them to bookings, and let them check in on the day.',
    sections: [
      { h2: 'One team, every booking', p: [
        'Add your regular crew once. Assign the right people to each booking and everyone can see where they need to be and when.',
      ] },
      { h2: 'Check-in on the day', ul: [
        'Crew check in from their phone with a personal link.',
        'You see who has arrived without calling anyone.',
        'Upcoming and past jobs are kept per crew member.',
      ] },
      { h2: 'Only what they need to see', p: [
        'Crew see the jobs they are assigned to — not your client list, your prices or your contracts.',
      ] },
    ],
    faq: [
      ['Can crew see my whole client list?', 'No. Crew only see the bookings they are assigned to.'],
      ['Do crew need an iwopo account?', 'No. They use a personal link to see their jobs and check in.'],
    ],
    related: ['/features/calendar', '/for/photo-and-video-studios', '/guides/managing-a-wedding-photography-team'],
  },

  calendar: {
    search: 'Booking calendar for wedding photographers',
    h1: 'Every wedding, every crew member, one calendar',
    lead: 'Bookings land on the calendar the moment a deposit is confirmed, with times, venue and crew attached.',
    sections: [
      { h2: 'See the season at a glance', p: [
        'Every confirmed booking appears on your calendar with its start and end times and venue. Pick a day to see exactly what is on.',
      ] },
      { h2: 'Avoid double bookings', p: [
        'Because bookings and inquiries share the same record, a date that is already taken is visible before you quote it to someone else.',
      ] },
      { h2: 'In your own time zone', p: [
        'Times are shown in the time zone you set, with the zone labeled, so a booking made from abroad still reads correctly.',
      ] },
    ],
    faq: [
      ['When does a booking appear on the calendar?', 'As soon as it is confirmed — for example, when the client’s deposit is recorded.'],
    ],
    related: ['/features/crew', '/features/leads', '/for/photo-and-video-studios'],
  },

  chatbot: {
    search: 'AI chat assistant for wedding photographers',
    h1: 'An assistant that answers inquiries while you are shooting',
    lead: 'An AI assistant that knows your packages and your answers, replies to visitors on your site, and says so when it does not know.',
    sections: [
      { h2: 'Answers from your own information', p: [
        'The assistant reads the same packages and the answers you give it, so a couple asking what is included or whether you travel gets your answer — not a guess.',
      ] },
      { h2: 'Honest when it does not know', p: [
        'When a question is outside what it knows, it says so and points the visitor to your inquiry form instead of inventing an answer.',
      ] },
      { h2: 'Inquiries while you are busy', p: [
        'Weddings happen on weekends, which is exactly when couples browse. The assistant keeps conversations going while your hands are on a camera.',
      ] },
    ],
    faq: [
      ['Does the assistant make things up?', 'It answers from your packages and the answers you provide, and says it does not know rather than inventing.'],
    ],
    related: ['/features/website', '/features/leads'],
  },
};
