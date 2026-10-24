/**
 * 📝 Ready-made contract templates a vendor can start from (Raj, 2026-10-24). Each button makes the vendor's OWN copy —
 * every word, section, condition, colour and font stays editable in Contract setup. Built from the Perfect Poses
 * reference agreement, with placeholders where it names the client, the business or amounts.
 */
export const WEDDING_AGREEMENT = {
  name: 'Event Coverage Agreement',
  event_type: 'Wedding',
  header: 'Wedding Photography & Videography',
  accent: 'gold',
  font_style: 'classic',
  sections: [
    { title: 'Booking Details', text: '{{booking_details}}', initial: false },
    { title: 'Event Coverage Schedule', text: '{{coverage_schedule}}', initial: false },
    { title: 'Services Summary', text: '{{services_summary}}', initial: true },
    { title: 'Package Inclusions & Deliverables', text: '{{deliverables}}', initial: true },
    { title: 'Cost & Payment', initial: true,
      text: 'The total cost of the services is {{total_cost}}. A non-refundable deposit of {{deposit}} is required to confirm the booking. The remaining balance of {{balance}} is due on the event day. If the deposit is not paid or confirmed, we do not take responsibility for booking confirmation.' },
    { title: 'Changes & Overtime', initial: true,
      text: 'Schedule shifts — any last-minute changes to start times or dates will incur additional fees, as they disrupt crew scheduling. Additional hours — any coverage beyond the hours listed above will be billed at $125 per hour, per crew member.' },
    { title: 'Social Media', initial: true,
      text: 'We love showcasing the high-caliber work we do for our clients. The Client grants {{company_name}} the right to use the final assets, as well as select behind-the-scenes content, for professional self-promotion.' },
    { title: 'Drone Coverage', initial: false, show_if: 'drone|aerial',
      text: 'Drone Policy: Usage is strictly conditional on weather (wind/rain) and local bylaws or restricted airspace. Drone coverage is scheduled only for specific events. No guarantees are made for drone footage due to these external safety factors.' },
    { title: 'Live Feed', initial: false, show_if: 'live feed|live-feed',
      text: 'Live-Feed Service: This is a technical service delivered with tested, professional equipment. No discounts or refunds apply in the event of unforeseen signal interference or venue-specific technical issues.' },
    { title: 'Next Day Edit', initial: false, show_if: 'next day edit|nde',
      text: '{{company_name}} is responsible only for the delivery of the Next Day Edit and pre-wedding videos via USB flash drive prior to the reception. While we ensure the files are functional upon delivery, we accept no responsibility for technical issues, audio/visual malfunctions, or playback sequencing errors caused by third-party equipment or venue operators.' },
    { title: 'Additional Policies', initial: false,
      text: 'Music:\nMusical tracks for all highlight films are artistically selected by the production team to ensure the best cinematic flow and rhythm. Once the edit is finalized, the music selection is fixed and cannot be changed.\n\nMeals:\nThe client is responsible for providing meals for the photography/videography team during events exceeding five (5) hours.\n\nRaw Footage:\nOur policy is not to release raw footage or unedited files, as these represent an unfinished stage of the creative process. All raw data is typically purged 30 days after project completion.' },
  ],
  legal_terms: `By booking a session and paying the retainer booking fee, the Client agrees to be bound by these Terms and Conditions.

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
In addition to oral and written agreements, the placing of a retainer fee for a future session and/or any use of the Image(s) by the Client constitutes acceptance of all of the foregoing terms and conditions.`,
};
