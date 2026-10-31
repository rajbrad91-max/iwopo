/**
 * ⚖️ iwopo's legal pages (2026-10-31): Terms of Service, Privacy Policy, Refund & Cancellation Policy, Cookie Policy.
 *
 * Plain-English drafts written from what iwopo actually does (checked on the server: hosting, storage, email, payments,
 * AI, face grouping, no third-party trackers). Raj's decisions: IWOPO, LLC (Delaware), no refunds — cancel any time and
 * keep access to the end of the paid period, contact sales@iwopo.com. To be reviewed by a lawyer before relying on it.
 * Rendered by lib/seoPage.js like every other standalone page; listed in allPages() so footers and the sitemap agree.
 */
export const LEGAL_UPDATED = '2026-10-31';
const CONTACT = 'sales@iwopo.com';

export const LEGAL = {
  terms: {
    path: '/terms', title: 'Terms of Service | iwopo', h1: 'Terms of Service',
    description: 'The terms for using iwopo, the all-in-one software for wedding photographers, videographers and studios.',
    lead: `These terms are an agreement between you and IWOPO, LLC, a Delaware limited liability company at 3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804, USA ("iwopo", "we", "us"). By creating an account or using iwopo you agree to them. If you use iwopo for a business, you confirm you can accept them for that business. Questions: ${CONTACT}.`,
    sections: [
      { h2: '1. What iwopo is', p: ['iwopo is online software for wedding and event professionals ("vendors"): inquiry forms, leads, packages, contracts with electronic signatures, invoices, bookings, crew scheduling, client galleries, file delivery, websites and related tools. Vendors use it to work with their own clients ("clients").'] },
      { h2: '2. Your account', ul: [
        'You must be at least 18 and give accurate information.',
        'Keep your password and sign-in codes private. You are responsible for what happens in your account, including actions by team members you add.',
        `Tell us at ${CONTACT} if you think someone has accessed your account without permission.`,
      ] },
      { h2: '3. Free trial, plans and payment', ul: [
        'New accounts get a free trial (currently 30 days). No card is needed to start it.',
        'To keep using paid features after the trial, choose a plan. If you choose a plan during the trial, billing starts when the trial ends.',
        'Plans renew automatically every month or year until you cancel. Prices are set in US dollars; at checkout you may pay in your local currency, converted by our payment processor (Stripe).',
        'Payments are handled by Stripe. We do not store your full card details.',
        'Prices may change. We will tell you at least 30 days before a change affects your next renewal; you can cancel before it applies.',
        'Taxes are added where required by law.',
        'If a payment fails, we may retry it and limit paid features until it is resolved.',
      ] },
      { h2: '4. Cancelling and refunds', p: ['You can cancel at any time in Plans → Manage billing. You keep your plan until the end of the period you have paid for, and it does not renew. Payments are not refunded, including for unused time, except where the law requires otherwise. See our Refund & Cancellation Policy.'] },
      { h2: '5. Your content and your clients’ information', ul: [
        'You own what you upload and create in iwopo — photos, videos, files, contracts, forms, website content and your clients’ details ("your content").',
        'You give us permission to store, process, display and transmit your content only as needed to run iwopo for you, keep it secure and improve its reliability.',
        'You are responsible for having the rights and permissions for your content — including permission from the people in your photos and videos and from your clients to store their information in iwopo.',
        'For your clients’ personal information you are the data controller and iwopo processes it on your behalf, as described in section 7.',
      ] },
      { h2: '6. Contracts, e-signatures and payments between you and your clients', p: [
        'iwopo provides tools to prepare contracts and collect electronic signatures, and records who signed, when and from where. You are responsible for the content of your contracts, packages and invoices and for making sure they suit the law where you and your clients are. iwopo is not a party to any agreement between you and your clients and does not give legal advice.',
        'Unless iwopo states otherwise in the product, your clients pay you directly; iwopo does not receive or hold those payments.',
      ] },
      { h2: '7. Processing your clients’ data on your behalf', ul: [
        'We process your clients’ personal information only to provide iwopo to you and on your instructions (how you use iwopo).',
        'We keep it confidential, protect it with appropriate security, and allow access only to people and service providers who need it to run iwopo (listed in our Privacy Policy).',
        'We help you respond to your clients’ requests to see, correct or delete their information, and we tell you without undue delay if we learn of a breach affecting it.',
        'When your account is deleted, we delete your content as described in section 10.',
        'Face grouping in galleries (which groups photos by the faces in them, and lets guests find their photos with a selfie) runs on iwopo’s own servers and, when they are busy, on Amazon Rekognition. Before using it, you are responsible for telling the people in your galleries and getting any consent the law requires where you and they are.',
      ] },
      { h2: '8. Acceptable use', p: ['Do not use iwopo to break the law, infringe others’ rights, upload content you have no right to share, send spam, harm or deceive people, upload malicious code, try to access other vendors’ data, or overload or attack the service. We may remove content or suspend accounts that do.'] },
      { h2: '9. Your own domain and addresses', p: ['iwopo may give your account a web address (such as yourname.iwopo.com) and, on plans that include it, let you connect a domain you own. You are responsible for your domain and its DNS settings. We may change or withdraw an address if it is misleading, infringes someone’s rights or is needed for the service.'] },
      { h2: '10. When an account ends', ul: [
        'If your trial ends or your plan lapses, paid features pause and your content is kept, so you can pick up where you left off by choosing a plan.',
        'We keep paused accounts for at least 90 days. After that we may delete the account and its content after giving you at least 30 days’ notice by email.',
        `You can ask us to delete your account at any time by writing to ${CONTACT}. Deleted content is removed from our systems within a reasonable time, including from backups.`,
        'Before your content is deleted, you can download it.',
      ] },
      { h2: '11. Availability and changes', p: ['We work to keep iwopo available and secure, but it may sometimes be unavailable for maintenance or reasons outside our control. We improve iwopo continually and may change features. If we make a change that significantly reduces what you pay for, we will tell you in advance.'] },
      { h2: '12. Disclaimers and limits of liability', p: [
        'iwopo is provided "as is" and "as available". To the extent the law allows, we disclaim implied warranties of merchantability, fitness for a particular purpose and non-infringement. Keep your own copies of important files.',
        'To the extent the law allows, iwopo is not liable for indirect, incidental, special or consequential damages, or lost profits, revenue or data. Our total liability for any claim is limited to the amount you paid iwopo in the 12 months before the claim.',
        'Nothing in these terms limits liability that cannot be limited by law.',
      ] },
      { h2: '13. Indemnity', p: ['You agree to defend and indemnify iwopo against claims arising from your content, your agreements with your clients, or your breach of these terms or the law.'] },
      { h2: '14. Law and disputes', p: ['These terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-law rules. If you are a consumer, you keep the protections of the laws where you live. We will try to resolve any dispute informally first — write to us.'] },
      { h2: '15. Changes to these terms', p: [`We may update these terms. If a change is significant, we will tell you by email or in iwopo at least 30 days before it takes effect. The date at the top shows the latest version. Contact: ${CONTACT}.`] },
    ],
  },

  privacy: {
    path: '/privacy', title: 'Privacy Policy | iwopo', h1: 'Privacy Policy',
    description: 'How iwopo collects, uses and protects personal information — for vendors, their clients and visitors.',
    lead: `This policy explains what personal information IWOPO, LLC ("iwopo") handles, why, and your choices. It covers vendors who use iwopo, the vendors’ clients and guests, and visitors to iwopo.com. Contact: ${CONTACT}.`,
    sections: [
      { h2: 'Two roles', ul: [
        'For vendors’ own accounts and for visitors to iwopo.com, iwopo decides how information is used (we are the "controller").',
        'For information vendors keep about their clients and guests — inquiries, contracts, galleries, files — the vendor decides, and iwopo processes it for them (we are the "processor"). Clients should contact the vendor first about their information; we will help the vendor respond.',
      ] },
      { h2: 'What we collect', ul: [
        'Account details: name, business name, email, phone, password (stored only as a secure hash), country, time zone, settings.',
        'Billing: plan, billing history and the last digits and type of your card — handled by Stripe; we never see or store full card numbers.',
        'Content vendors add: client names and contact details, event details, contracts and signatures (with the time, IP address and device recorded for the signature), invoices, photos, videos and files.',
        'Gallery face grouping: when a vendor uses it, face measurements are created from gallery photos (and from a selfie a guest chooses to upload) to group photos of the same person. This runs on iwopo’s own servers; when they are busy, a gallery may be processed by Amazon Rekognition instead. The measurements are used only for that gallery, never sold or used to identify people elsewhere, and are deleted — including Amazon’s copy — when the gallery is deleted.',
        'Security and usage: sign-in events, trusted devices, IP addresses, browser type and basic logs that keep iwopo secure and working.',
        'Messages you send us.',
      ] },
      { h2: 'How we use it', ul: [
        'To provide iwopo: accounts, sign-in, the vendor’s tools and the pages their clients use.',
        'To bill subscriptions, prevent fraud and keep accounts secure (for example two-step sign-in).',
        'To send service emails: sign-in codes, trial reminders, receipts and notices. We do not send marketing emails without your consent, and you can opt out at any time.',
        'To fix problems and improve iwopo.',
        'To meet legal obligations.',
        'We do not sell personal information, and we do not use it for third-party advertising.',
      ] },
      { h2: 'Service providers we use', ul: [
        'Hostinger — servers and database (United States).',
        'Cloudflare (R2) and Amazon Web Services — storage of photos, videos and files.',
        'Google Workspace — sending email.',
        'Stripe — subscription payments.',
        'Amazon Web Services (Rekognition) — backup face grouping for galleries when our own servers are busy.',
        'Anthropic and Google (Gemini) — AI features such as the chat assistant. Content is sent only when an AI feature is used, and only what that feature needs.',
        'Each provider only receives what it needs to do its job and is bound to protect it.',
      ] },
      { h2: 'International transfers', p: ['iwopo is run from the United States and our providers may process information in other countries. Where the law requires it (for example for the EU, UK or Canada), we rely on appropriate safeguards such as standard contractual clauses.'] },
      { h2: 'How long we keep it', ul: [
        'Account and content: for as long as the account exists. Paused accounts are kept at least 90 days, then may be deleted after 30 days’ notice.',
        'Billing records: as long as tax and accounting law requires.',
        'Security logs: for a limited period, then deleted.',
        'Vendors can delete their clients’ information, galleries and files at any time; deleted items are removed from our systems within a reasonable time, including backups.',
      ] },
      { h2: 'Security', p: ['Connections are encrypted (https), passwords are hashed, sign-in can require a code sent by email, each vendor’s data is kept separate and tested for it, and access is limited to people and services that need it. No system is perfectly secure; if a breach affects your information we will tell you and the relevant authorities as the law requires.'] },
      { h2: 'Your rights', p: [
        `Depending on where you live (for example under the GDPR in Europe, UK GDPR, Canada’s PIPEDA or California’s CCPA), you may have the right to access, correct, delete or download your information, to object to or restrict some uses, and to complain to a data-protection authority. Write to ${CONTACT}; we answer within the time the law requires. If your information is held by a vendor (for example in a gallery or contract), we will pass your request to that vendor and help them.`,
      ] },
      { h2: 'Children', p: ['iwopo accounts are for adults. Photos in a vendor’s galleries may include children; the vendor is responsible for having the right to share them.'] },
      { h2: 'Cookies', p: ['iwopo does not use advertising or third-party tracking cookies. See our Cookie Policy.'] },
      { h2: 'Changes', p: [`We will post updates here and tell account holders about significant changes. Contact: ${CONTACT} · IWOPO, LLC, 3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804, USA.`] },
    ],
  },

  refunds: {
    path: '/refund-policy', title: 'Refund & Cancellation Policy | iwopo', h1: 'Refund & Cancellation Policy',
    description: 'Free trial, cancelling an iwopo plan, and refunds.',
    lead: 'Try iwopo free first; cancel any time; you keep what you paid for until the end of the period. Payments are not refunded.',
    sections: [
      { h2: 'Free trial', ul: ['New accounts get a free trial (currently 30 days), with no card needed.', 'Choosing a plan during the trial does not shorten it: billing starts when the trial ends.', 'We email you before the trial ends.'] },
      { h2: 'Cancelling', ul: ['Cancel any time in Plans → Manage billing — no need to contact us.', 'Your plan stays active until the end of the month or year you have paid for, then it does not renew.', 'Your content is kept after that, so you can return by choosing a plan (see our Terms for how long).'] },
      { h2: 'Refunds', ul: ['Payments are not refunded, including for unused time on monthly or yearly plans, because you keep full access until the end of the period.', 'Changing plans in Manage billing is adjusted automatically by Stripe for the time remaining.', 'Where the law where you live gives you a right to a refund, that right applies.', `If you were charged in error (for example twice), write to ${'sales@iwopo.com'} and we will put it right.`] },
    ],
  },

  cookies: {
    path: '/cookies', title: 'Cookie Policy | iwopo', h1: 'Cookie Policy',
    description: 'What iwopo stores in your browser — and what it does not.',
    lead: 'iwopo does not use advertising cookies or third-party trackers. It only stores what the app needs to work.',
    sections: [
      { h2: 'What iwopo stores', ul: [
        'Your sign-in session, so you stay signed in, and a "trusted device" marker if you choose to be remembered for 30 days.',
        'Preferences such as light or dark theme and time zone.',
        'Small technical items the app needs, for example to finish an upload.',
        'These are kept in your browser’s storage for iwopo only; they are not shared with advertisers.',
      ] },
      { h2: 'What iwopo does not use', ul: ['No Google Analytics, Facebook Pixel or similar tracking.', 'No advertising cookies.'] },
      { h2: 'Payments', p: ['When you pay for a plan you use Stripe’s checkout page, which sets its own cookies to process the payment safely and prevent fraud (see Stripe’s privacy policy).'] },
      { h2: 'Your choices', p: [`You can clear iwopo’s stored items in your browser settings at any time; you will then need to sign in again. Questions: ${CONTACT}.`] },
    ],
  },
};
