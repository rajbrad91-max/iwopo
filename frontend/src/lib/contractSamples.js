/**
 * 📖 Sample contracts, one per trade (Raj, 2026-11-05). Contract setup shows the vendor the sample for their trade —
 * read-only, an example to read — and "Make my own copy" turns it into an ordinary, fully editable template.
 * A vendor's trade is chosen when they join and changes when they load a preset in the inquiry form and save it.
 *
 * Amounts never appear as numbers: {{total_cost}}, {{deposit}} and {{balance}} are filled in the vendor's own
 * currency when a contract is built. The parts every agreement shares are written once (below) and reused.
 * The photo & video sample is the Perfect Poses reference agreement, with placeholders for every name and amount.
 *
 * Examples only, not legal advice — the panel says so beside every sample.
 */

/* ── the parts every agreement shares ─────────────────────────────────────────────────────────────────────── */
const booking = { title: 'Booking Details', text: '{{booking_details}}', initial: false };
const schedule = (title = 'Event Schedule') => ({ title, text: '{{coverage_schedule}}', initial: true });
const included = (title = "What's Included") => ({ title, text: '{{services_summary}}', initial: true });
const deliverables = (title = 'Deliverables') => ({ title, text: '{{deliverables}}', initial: true });
const payment = (due = 'on the event day') => ({
  title: 'Cost & Payment', initial: true,
  text: `The total cost of the services is {{total_cost}}. A non-refundable deposit of {{deposit}} ({{deposit_percent}}%) confirms the booking; the date is not held until it is paid. The remaining balance of {{balance}} is due ${due}.`,
});
const changes = (time) => ({
  title: 'Changes & Extra Time', initial: true,
  text: `Changes to the date, start time or location must be agreed in writing and may carry an extra fee where they affect staffing or other bookings. ${time}`,
});
const cancellation = (notice) => ({
  title: 'Cancellation & Rescheduling', initial: true,
  text: `If the Client cancels, the deposit is kept. ${notice} A new date can be offered where {{company_name}} is available; the deposit then moves to the new date once, and any difference in price applies.`,
});
const conduct = {
  title: 'Conduct & Safety', initial: false,
  text: '{{company_name}} keeps a zero-tolerance policy for abuse of its team. If any team member is threatened, harassed or assaulted, {{company_name}} may stop the service at once without refund. The Client is responsible for the conduct of their guests.',
};
const terms = (role) => `By signing this agreement or paying the deposit, the Client agrees to these terms.

Parties:
This agreement is between {{company_name}} (the "${role}") and {{client_name}} (the "Client"). The ${role} works as an independent contractor.

Payment:
No service is guaranteed until the deposit is received. The balance is due as stated above; late payment may delay any delivery, and bank or card fees are the Client's responsibility.

Failure to Perform:
If the ${role} cannot attend because of illness, accident or another cause outside their reasonable control, they will make reasonable efforts to arrange a qualified substitute. If none can be arranged, the ${role}'s only liability is to refund the payments received, and nothing beyond them.

Limitation of Liability:
The ${role} takes all reasonable care but is not liable for loss, damage or cost beyond the amount paid under this agreement, nor for anything caused by the venue, other suppliers, guests or conditions outside their control.

Force Majeure:
Neither party is responsible for failing to perform because of events beyond their control — extreme weather, natural disaster, public-health orders, government action, venue closure. The parties will agree a new date in good faith where possible.

Whole Agreement:
This contract, the package and any written changes are the whole agreement. Electronic signatures and email are binding. The Client may not transfer this agreement without the ${role}'s written consent.`;

/** The Perfect Poses reference agreement's own terms, word for word (the photo & video sample). */
const REFERENCE_TERMS = `By booking a session and paying the retainer booking fee, the Client agrees to be bound by these Terms and Conditions.

Definitions:
This Agreement is made between {{company_name}} (the "Photographer") and the client identified on the signature page ("{{client_name}}"), which includes the Client's principals, employees, affiliates, and representatives. The Client represents and warrants that it has the legal authority to enter into this Agreement on behalf of its employer, company, or organization. The Photographer's relationship with the Client is that of an independent contractor.
"Image(s)" means the photographic material, whether still or moving, created by the Photographer pursuant to this Agreement, including without limitation transparencies, negatives, prints, and digital files captured, recorded, stored, or delivered in any analogue, photographic, optical, electronic, magnetic, digital, or other media.

Usage Rights and Ownership:
The Client acknowledges that the Photographer is the author and the first and sole owner of all copyright in the Image(s). The Image(s) and all copyright therein remain the exclusive property of the Photographer without limitation. The usage rights granted to the Client are as set out in the attached Invoice or Quote.

Image License, Alterations & Promotion:
The Client acknowledges and agrees that it is not purchasing the Image(s), but is acquiring only a licence to use the Image(s) as specified in this Agreement. Acquiring the copyright to the Image(s) is available at additional cost and will exceed any licensing fee. The term of the licence commences on the date the Photographer receives full payment of the invoice and delivers the Image(s). Copyright metadata contained within any digital file may not be altered or removed without the Photographer's express written consent. Unless otherwise agreed in writing, the Photographer retains the right to use the Image(s) for self-promotion.

General Liability and Releases:
The Photographer will exercise all reasonable care in the production of the Image(s) and the performance of this Agreement, but will not be liable for any loss, damage, or cost suffered by the Client or any third party arising from the Client's use of any Image(s). The Client will indemnify, defend, and hold harmless the Photographer, its contractors, and its representatives from and against any and all claims, liabilities, damages, costs, and expenses, including reasonable legal fees, arising from the Client's use of any Image(s).
The Photographer is not responsible for obtaining model, property, trademark, copyright, or other releases in connection with the Image(s) unless expressly stated in this Agreement. The Client is solely responsible for obtaining all permissions necessary for any use of the Image(s) that requires a release or other consent. Should the Photographer agree to provide any release, the Client remains responsible for determining whether such release is suitable for the Client's purposes, and the Photographer makes no warranty or representation as to the legal validity of any release.

Payment:
Time is of the essence with respect to receipt of full payment under this Agreement. No usage rights are granted until the Photographer has received payment in full, including any applicable late-payment charges. Unless otherwise agreed in writing, any use of the Image(s) prior to full payment constitutes unauthorized use. The parties agree that the actual damages resulting from such unauthorized use are difficult to determine, and that an amount equal to twice the invoice total represents a reasonable pre-estimate of those damages and not a penalty.
Where usage rights are granted before full payment, the Photographer reserves the right to rescind those rights if the Client fails to pay in a timely manner. The Photographer's invoice serves as the Client's receipt for work performed and services rendered. Bank transfer fees are the responsibility of the Client.

Cancellations and Postponements:
A non-refundable retainer fee, in the amount specified at the time of booking, is required to reserve the Client's session date and is non-refundable under any circumstances. The remaining balance is due on the date of the session. If the Client cancels, the retainer is forfeited and may not be applied to any other session. If the Client does not cancel and the Photographer attends the agreed session location, the Client remains responsible for payment of the remaining balance in full.

Reshoots:
If the Client requires a reshoot, the Client will pay the Photographer an additional fee equal to 100% of the fee stated in the original quote or invoice, together with all reshoot expenses. If a reshoot is required due to factors beyond the Photographer's reasonable control, including without limitation weather conditions or acts of nature, the Photographer will not charge an additional fee, and the Client will pay all expenses associated with the reshoot.

Failure to Perform:
If the Photographer is unable to provide the photographic services due to illness, mechanical breakdown, accident, act of nature, or any other cause beyond the Photographer's reasonable control, the Photographer will make reasonable efforts to procure a qualified substitute photographer to fulfill its obligations under this Agreement. If a suitable substitute can be secured, the Photographer's obligations are deemed satisfied.
If no suitable substitute can be secured, the Photographer's sole liability will be to refund all fees paid by the Client, after which the Photographer will have no further liability under this Agreement and will not be responsible for any other damages beyond the amounts paid. This limitation of liability also applies if any Image is lost or damaged through equipment malfunction or technical failure.

Cancellation Fee:
Provided the Photographer has performed the photography assignment in a professional and competent manner, the Client will pay the Photographer all fees and expenses associated with the assignment, whether or not the Client uses any of the Image(s).

Archiving Digital Files:
While the Photographer may elect to archive the Image(s), the Client is solely responsible for properly storing the delivered Image(s). The Photographer cannot guarantee the availability of any Image(s) beyond the date of first delivery to the Client. The Client acknowledges that optical, magnetic, electronic, and other media for storing digital data are inherently unstable, and releases the Photographer, its contractors, and its representatives from any liability for claims, damages, or costs arising from any media supplied by the Photographer becoming unusable.
All digital files and Image(s) created by the Photographer will be deleted or destroyed 30 days after delivery to the Client. Any request for the Photographer to reproduce Image(s) already delivered will incur an additional processing fee.

Digital File Quality:
Unless otherwise specified, the Photographer may deliver, and the Client agrees to accept, the Image(s) encoded in an industry-standard data format selected by the Photographer, at a resolution the Photographer determines suitable to the reproduction technology and use(s) for which the Image(s) are licensed.
The Photographer uses cameras and monitors colour-calibrated to industry standards. Owing to variances in other monitors, software, and computer platforms, the Image(s) may display differently elsewhere. The Client is responsible for verifying that the digital data is suitable for reproduction of the expected quality and colour accuracy. If the data is not suitable, the Photographer's sole obligation will be to replace or repair the data, and in no event will the Photographer be liable for poor reproduction quality, delays, losses, expenses, or consequential damages.
All editing is performed at the Photographer's discretion, and the Photographer reserves the right to decline additional edits. Image(s) may be produced in colour or black and white at the Photographer's discretion. Any further editing requested by the Client is performed at additional cost, and each revision will incur an additional fee.

Session Terms:
Sessions will be conducted at a location agreed upon by the Photographer. The Photographer will not trespass on or use any property or location where such activity is unlawful, and will comply with any rules applicable to the property or location. Where the Client wishes to use private property, the Client is solely responsible for obtaining authorization from the property owner. The Photographer is not responsible for hazards at the location, and the Client attends the session at the Client's own risk.
No other photographers or videographers are permitted during the session unless agreed to in writing by the Photographer.
Conduct: The Photographer maintains a zero-tolerance policy with respect to abuse of its personnel. If any member of the Photographer's team is subjected to physical or verbal abuse, assault, or harassment by the Client or the Client's guests, the Photographer reserves the right to terminate the session immediately without refund. The Client is responsible for the conduct of the Client's guests.

Acceptance of Terms:
The Client may not assign or transfer this Agreement, or any rights granted hereunder, without the Photographer's prior written consent. This Agreement is binding upon and inures to the benefit of the Client and the Photographer and their respective principals, employees, representatives, and successors. The Client and its principals and employees are jointly and severally liable for the performance of all payment and other obligations under this Agreement.
Electronic mail and electronic signatures are deemed legally binding. The invoice may reflect, and the Client is bound by, the Client's oral authorizations for additional Image(s), fees, and expenses that could not be confirmed in writing owing to the immediate proximity of completing the photography assignment.
In addition to oral and written agreements, the placing of a retainer fee for a future session and/or any use of the Image(s) by the Client constitutes acceptance of all of the foregoing terms and conditions.`;

/* ── a sample for each trade ─────────────────────────────────────────────────────────────────────────────── */
const sample = (fields) => ({ accent: 'gold', font_style: 'classic', event_type: 'Wedding', ...fields });

export const CONTRACT_SAMPLES = {
  photo_video: sample({
    name: 'Event Coverage Agreement', header: 'Wedding Photography & Videography',
    sections: [
      booking,
      schedule('Event Coverage Schedule'),
      included('Services Summary'),
      deliverables('Package Inclusions & Deliverables'),
      { title: 'Cost & Payment', initial: true,
        text: 'The total cost of the services is {{total_cost}}. A non-refundable deposit of {{deposit}} is required to confirm the booking. The remaining balance of {{balance}} is due on the event day. If the deposit is not paid or confirmed, we do not take responsibility for booking confirmation.' },
      { title: 'Changes & Overtime', initial: true,
        text: 'Schedule shifts — any last-minute changes to start times or dates will incur additional fees, as they disrupt crew scheduling. Additional hours — any coverage beyond the hours listed above will be billed at the hourly rate stated in the package, per crew member.' },
      { title: 'Social Media', initial: true,
        text: 'We love showcasing the high-caliber work we do for our clients. The Client grants {{company_name}} the right to use the final assets, as well as select behind-the-scenes content, for professional self-promotion.' },
      { title: 'Drone Coverage', initial: false, show_if: 'drone|aerial',
        text: 'Drone Policy: Usage is strictly conditional on weather (wind/rain) and local bylaws or restricted airspace. Drone coverage is scheduled only for specific events. No guarantees are made for drone footage due to these external safety factors.' },
      { title: 'Live Feed', initial: false, show_if: 'live feed|live-feed',
        text: 'Live-Feed Service: This is a technical service delivered with tested, professional equipment. No discounts or refunds apply in the event of unforeseen signal interference or venue-specific technical issues.' },
      { title: 'Live Streaming', initial: false, show_if: 'live stream|livestream',
        text: "Live Streaming: {{company_name}} streams with tested equipment, but a stream depends on the venue's internet connection, bandwidth and local conditions outside our control. {{company_name}} is not liable for interruptions or lower quality caused by them, and they do not entitle the client to a discount or refund." },
      { title: 'Next Day Edit', initial: false, show_if: 'next day edit|nde',
        text: '{{company_name}} is responsible only for the delivery of the Next Day Edit and pre-wedding videos via USB flash drive prior to the reception. While we ensure the files are functional upon delivery, we accept no responsibility for technical issues, audio/visual malfunctions, or playback sequencing errors caused by third-party equipment or venue operators.' },
      { title: 'Additional Policies', initial: false,
        text: 'Music:\nMusical tracks for all highlight films are artistically selected by the production team to ensure the best cinematic flow and rhythm. Once the edit is finalized, the music selection is fixed and cannot be changed.\n\nMeals:\nThe client is responsible for providing meals for the photography/videography team during events exceeding five (5) hours.\n\nRaw Footage:\nOur policy is not to release raw footage or unedited files, as these represent an unfinished stage of the creative process. All raw data is typically purged 30 days after project completion.' },
    ],
    legal_terms: REFERENCE_TERMS,
  }),
  photographer: sample({
    name: 'Photography Agreement', header: 'Wedding & Event Photography',
    sections: [
      booking, schedule('Coverage Schedule'), included('Services Summary'), deliverables('Photos You Receive'), payment(),
      changes('Coverage beyond the booked hours is billed at the hourly rate stated in the package.'),
      cancellation('Cancelling within 30 days of the event means the full balance is due, as the date can rarely be rebooked.'),
      { title: 'Delivery & Editing', initial: true,
        text: 'Edited photos are delivered in an online gallery within the time stated in the package. Editing style, colour and black-and-white choices are made by {{company_name}}; extra retouching is available at an additional cost. Unedited (RAW) files are not released.' },
      { title: 'Image Use & Copyright', initial: true,
        text: '{{company_name}} owns the copyright in every photo and grants the Client a personal licence to print and share them. {{company_name}} may use selected photos for its portfolio and social media unless the Client asks in writing for them not to be used.' },
      { title: 'On the Day', initial: false,
        text: 'The Client provides a schedule and a contact person for group photos. Other photographers may not obstruct or direct the coverage. For events longer than five hours, the Client provides a meal for the photography team.' },
      conduct,
    ],
    legal_terms: terms('Photographer'),
  }),
  videographer: sample({
    name: 'Videography Agreement', header: 'Wedding & Event Films',
    sections: [
      booking, schedule('Filming Schedule'), included('Services Summary'), deliverables('Films You Receive'), payment(),
      changes('Filming beyond the booked hours is billed at the hourly rate stated in the package.'),
      cancellation('Cancelling within 30 days of the event means the full balance is due, as the date can rarely be rebooked.'),
      { title: 'Editing & Music', initial: true,
        text: 'Films are edited in the style of {{company_name}} and delivered within the time stated in the package. Music is chosen and licensed by {{company_name}}; once a film is final, the music cannot be changed. One round of small revisions is included; further changes are billed.' },
      { title: 'Footage & Copyright', initial: true,
        text: '{{company_name}} owns the copyright in all footage and grants the Client a personal licence to watch and share the films. Raw footage is not released and is deleted 30 days after delivery. {{company_name}} may use clips for its portfolio unless asked in writing not to.' },
      { title: 'Drone Filming', initial: false, show_if: 'drone|aerial',
        text: 'Drone filming depends on the weather, the venue and local flight rules; it cannot be guaranteed, and missing aerial shots do not entitle the Client to a refund.' },
      { title: 'Live Streaming', initial: false, show_if: 'live stream|livestream',
        text: "A live stream depends on the venue's internet connection and conditions outside {{company_name}}'s control; interruptions do not entitle the Client to a discount or refund." },
      conduct,
    ],
    legal_terms: terms('Videographer'),
  }),
  dj: sample({
    name: 'DJ Services Agreement', header: 'DJ & Entertainment',
    sections: [
      booking, schedule('Performance Schedule'), included('Services & Equipment'), payment(),
      changes('Playing beyond the booked hours is billed at the hourly rate stated in the package and needs the venue\'s agreement.'),
      cancellation('Cancelling within 30 days of the event means the full balance is due.'),
      { title: 'Music Requests', initial: true,
        text: 'The Client may send must-play and do-not-play lists up to two weeks before the event. {{company_name}} plays requests where they suit the crowd and the schedule, and reads the room for the rest of the night.' },
      { title: 'Power, Space & Volume', initial: true,
        text: 'The Client arranges a safe, covered set-up area near dedicated power outlets, and access for load-in at least two hours before the start. {{company_name}} follows the venue\'s volume limits and curfew; stopping on time at the venue\'s request is not a breach of this agreement.' },
      { title: 'Equipment', initial: false,
        text: 'Equipment remains the property of {{company_name}}. The Client is responsible for damage caused by guests. Outdoor set-ups need shelter from rain and direct sun; {{company_name}} may pause or stop if the weather makes the equipment unsafe.' },
      conduct,
    ],
    legal_terms: terms('DJ'),
  }),
  makeup: sample({
    name: 'Make-Up Services Agreement', header: 'Bridal Hair & Make-Up',
    sections: [
      booking, schedule('Appointment Schedule'), included('Services Booked'), payment('on the day of the service, before the first appointment'),
      changes('Extra people or services added on the day are charged at the rates stated in the package, where time allows.'),
      cancellation('Cancelling within 14 days of the event means the full balance is due.'),
      { title: 'Skin, Allergies & Products', initial: true,
        text: 'The Client tells {{company_name}} about any allergies, sensitivities or skin conditions before the appointment; a patch test is available on request. {{company_name}} uses professional, hygienic products and is not responsible for reactions to allergies it was not told about.' },
      { title: 'Timing & Location', initial: true,
        text: 'The Client provides a well-lit space with a table, chair and power outlet, and makes sure everyone is ready at their time slot with clean, dry hair and a clean face. Late starts may shorten services so the day stays on time.' },
      { title: 'Trial Session', initial: false,
        text: 'A trial, where included, is the time to agree the look. Changes requested on the day beyond the agreed look may not be possible in the time available.' },
      { title: 'Photos of the Work', initial: false,
        text: '{{company_name}} may photograph its work for its portfolio and social media unless the Client asks in writing for it not to.' },
      conduct,
    ],
    legal_terms: terms('Artist'),
  }),
  cake: sample({
    name: 'Cake Order Agreement', header: 'Wedding Cakes & Desserts',
    sections: [
      booking, included('Your Order'), payment('two weeks before the event'),
      changes('Design or size changes are accepted up to three weeks before the event and may change the price.'),
      cancellation('Cancelling within 14 days of the event means the full balance is due, as ingredients and decorations are prepared ahead.'),
      { title: 'Allergens & Ingredients', initial: true,
        text: 'Cakes are made in a kitchen that handles nuts, gluten, dairy and eggs. {{company_name}} cannot guarantee a cake free of any allergen; the Client is responsible for informing guests.' },
      { title: 'Delivery & Set-Up', initial: true,
        text: 'Delivery and set-up at {{location}} are arranged for the agreed time. The Client makes sure there is a level, stable table, out of direct sun and heat. Once the cake is set up and signed for, its care passes to the Client and the venue.' },
      { title: 'Design', initial: false,
        text: 'Every cake is handmade, so small differences from photos or sketches are part of the craft. Fresh flowers supplied by others are the Client\'s responsibility to check as safe for food contact.' },
      { title: 'Stands & Rentals', initial: false,
        text: 'Cake stands and props lent by {{company_name}} are returned within three days after the event; missing or damaged items are charged at replacement cost.' },
    ],
    legal_terms: terms('Baker'),
  }),
  florist: sample({
    name: 'Floral Services Agreement', header: 'Wedding & Event Florals',
    sections: [
      booking, included('Floral Order'), payment('two weeks before the event'),
      changes('Changes to the order are accepted up to three weeks before the event and may change the price.'),
      cancellation('Cancelling within 21 days of the event means the full balance is due, as flowers are ordered in advance.'),
      { title: 'Seasonal Substitutions', initial: true,
        text: 'Flowers are natural and seasonal. If a variety is unavailable or below standard, {{company_name}} substitutes flowers of similar style, colour and value without prior notice.' },
      { title: 'Delivery, Set-Up & Collection', initial: true,
        text: 'Delivery and set-up at {{location}} happen at the agreed time; the Client arranges venue access. Rented vases, arches and stands are collected after the event at a time agreed with the venue.' },
      { title: 'Rentals & Damage', initial: false,
        text: 'Rented items remain the property of {{company_name}}. Items lost or damaged at the event are charged at replacement cost.' },
      { title: 'Photos of the Work', initial: false,
        text: '{{company_name}} may photograph its work for its portfolio and social media unless the Client asks in writing for it not to.' },
    ],
    legal_terms: terms('Florist'),
  }),
  bartender: sample({
    name: 'Bar Services Agreement', header: 'Bartending & Bar Services',
    sections: [
      booking, schedule('Bar Schedule'), included('Bar Services'), payment(),
      changes('Service beyond the booked hours is billed at the hourly rate stated in the package, per bartender.'),
      cancellation('Cancelling within 14 days of the event means the full balance is due.'),
      { title: 'Responsible Service', initial: true,
        text: 'Bartenders serve responsibly and within the law. They check ID, and refuse service to anyone underage or visibly intoxicated; such refusals are not a breach of this agreement. Last call is given at the time agreed with the Client and the venue.' },
      { title: 'Licences & Supply', initial: true,
        text: 'The Client or the venue holds any event licence or permit required, unless the package says {{company_name}} provides it. Where the Client supplies the alcohol, they also supply ice, mixers and glassware unless included in the package.' },
      { title: 'Bar Set-Up', initial: false,
        text: 'The Client arranges a bar area with access to water, power and waste disposal. Equipment and glassware supplied by {{company_name}} that is lost or broken by guests is charged at replacement cost.' },
      conduct,
    ],
    legal_terms: terms('Bar Service'),
  }),
  caterer: sample({
    name: 'Catering Agreement', header: 'Wedding & Event Catering',
    sections: [
      booking, schedule('Service Schedule'), included('Menu & Service'), payment('seven days before the event'),
      changes('The final guest count is confirmed 14 days before the event and is the minimum charged; guests added later are charged per person where possible.'),
      cancellation('Cancelling within 21 days of the event means the full balance is due, as food and staff are booked ahead.'),
      { title: 'Dietary Needs & Allergies', initial: true,
        text: 'The Client provides all dietary requirements and allergies with the final guest count. {{company_name}} prepares food in a kitchen that handles common allergens and cannot guarantee any dish free of them.' },
      { title: 'Food Safety', initial: true,
        text: 'Food is prepared and served to food-safety standards. For guest safety, leftover food is not packed for later unless local rules allow it and the Client agrees to take responsibility for it.' },
      { title: 'Staff, Equipment & Venue', initial: false,
        text: 'Staffing levels are set for the agreed guest count. The Client arranges kitchen or preparation space, power and water at the venue. Rented equipment lost or damaged at the event is charged at replacement cost.' },
      conduct,
    ],
    legal_terms: terms('Caterer'),
  }),
  planner: sample({
    name: 'Planning Services Agreement', header: 'Wedding & Event Planning',
    sections: [
      booking, included('Planning Services'), payment('30 days before the event'),
      changes('Planning beyond the services listed, and extra meetings or hours on the day, are billed at the rate stated in the package.'),
      cancellation('Cancelling within 60 days of the event means the full balance is due, as the planning work is already done.'),
      { title: 'Suppliers', initial: true,
        text: '{{company_name}} recommends and coordinates suppliers, but the Client contracts and pays them directly. {{company_name}} is not responsible for a supplier\'s performance, products or failure to attend.' },
      { title: 'Decisions & Budget', initial: true,
        text: 'The Client makes the final decisions and keeps to the agreed budget. Delays in decisions or approvals may limit what can be arranged in time.' },
      { title: 'Communication', initial: false,
        text: 'Meetings and calls are scheduled during business hours. On the day, {{company_name}} is the main point of contact for suppliers and the venue.' },
      conduct,
    ],
    legal_terms: terms('Planner'),
  }),
  musician: sample({
    name: 'Performance Agreement', header: 'Live Music & Performance',
    sections: [
      booking, schedule('Performance Schedule'), included('Performance'), payment(),
      changes('Performing beyond the booked sets is billed at the rate stated in the package and needs the venue\'s agreement.'),
      cancellation('Cancelling within 30 days of the event means the full balance is due.'),
      { title: 'Sets & Requests', initial: true,
        text: 'The performance runs in the sets agreed, with short breaks between them. Special song requests are sent at least four weeks before the event; learning new songs may carry an extra fee.' },
      { title: 'Stage, Sound & Power', initial: true,
        text: 'The Client arranges a level, covered performance area with power near it and time for sound-check before guests arrive. {{company_name}} follows the venue\'s volume limits and curfew.' },
      { title: 'Hospitality', initial: false,
        text: 'For performances over three hours, the Client provides a meal and a private space to rest between sets.' },
      conduct,
    ],
    legal_terms: terms('Performer'),
  }),
  transportation: sample({
    name: 'Transportation Agreement', header: 'Wedding & Event Transportation',
    sections: [
      booking, schedule('Pick-Up & Drop-Off Schedule'), included('Vehicles & Service'), payment('seven days before the event'),
      changes('Waiting time beyond the booked hours, and extra stops, are billed at the rate stated in the package.'),
      cancellation('Cancelling within 14 days of the event means the full balance is due.'),
      { title: 'Timing & Routes', initial: true,
        text: 'Vehicles arrive at the agreed times. Traffic, road closures and weather may cause delays outside {{company_name}}\'s control; the driver chooses the safest route.' },
      { title: 'Passengers & Conduct', initial: true,
        text: 'Passenger numbers may not exceed the vehicle\'s licensed capacity, and seat belts are worn where fitted. Smoking and illegal substances are not allowed; the driver may end a trip if passengers behave unsafely.' },
      { title: 'Cleaning & Damage', initial: false,
        text: 'Damage to a vehicle, or cleaning needed beyond normal use, is charged to the Client at cost.' },
    ],
    legal_terms: terms('Provider'),
  }),
  other: sample({
    name: 'Services Agreement', header: 'Event Services',
    sections: [
      booking, schedule(), included('Services'), payment(),
      changes('Work beyond the agreed scope is billed at the rate stated in the package.'),
      cancellation('Cancelling within 30 days of the event means the full balance is due.'),
      { title: 'Client Responsibilities', initial: true,
        text: 'The Client provides accurate details, venue access at the agreed times and anything this agreement says they will arrange.' },
      conduct,
    ],
    legal_terms: terms('Provider'),
  }),
};

/** The sample for a trade — "Other" when the trade has none. */
export const contractSampleFor = (trade) => CONTRACT_SAMPLES[trade] || CONTRACT_SAMPLES.other;
