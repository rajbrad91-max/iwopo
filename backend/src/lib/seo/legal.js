/**
 * ⚖️ iwopo's legal pages: Terms of Service, Privacy Policy, Refund & Cancellation Policy, Cookie Policy.
 *
 * Detailed drafts (Raj, 2026-11-12: the earlier ones read as too short) written from what iwopo actually does — checked
 * on the server: hosting, storage, email, payments, fixed local prices, AI, face grouping, no third-party trackers.
 * Raj's decisions: IWOPO, LLC (Delaware); no refunds — cancel any time and keep access to the end of the paid period;
 * contact sales@iwopo.com. Not written by a lawyer: to be reviewed by one before relying on it.
 * Rendered by lib/seoPage.js like every other standalone page; listed in allPages() so footers and the sitemap agree.
 */
export const LEGAL_UPDATED = '2026-11-12';
const CONTACT = 'sales@iwopo.com';
const COMPANY = 'IWOPO, LLC, 3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804, USA';

export const LEGAL = {
  terms: {
    path: '/terms', title: 'Terms of Service | iwopo', h1: 'Terms of Service',
    description: 'The terms for using iwopo, the all-in-one software for wedding photographers, videographers and studios.',
    lead: `These Terms of Service (the "Terms") are a binding agreement between you and IWOPO, LLC, a Delaware limited liability company at 3 Germay Dr, Unit 4 #3327, Wilmington, DE 19804, USA ("iwopo", "we", "us", "our"). They govern your access to and use of the iwopo website, applications and related services (together, the "Service"). By creating an account, starting a trial, or otherwise using the Service, you confirm that you have read, understood and agree to these Terms and to our Privacy Policy, Refund & Cancellation Policy and Cookie Policy, which form part of them. If you do not agree, do not use the Service.`,
    sections: [
      { h2: '1. Definitions', ul: [
        '"Vendor", "you" and "your" mean the person or business that opens an iwopo account, and anyone you allow to use it.',
        '"Client" means your customers, their guests and anyone else whose information you place in the Service or who uses a page you publish through it (for example an inquiry form, gallery, contract or invoice).',
        '"Content" means everything you or your Clients upload, enter or create in the Service, including photos, videos, files, text, contracts, invoices and Client information.',
        '"Plan" means the subscription level you choose (currently Free, Essential, Pro and Studio); "Add-on" means an optional paid extra, such as additional storage.',
        '"Paid Period" means the month or year you have paid for in advance.',
      ] },
      { h2: '2. The Service', p: ['iwopo is online software for wedding and event professionals. It provides inquiry forms, lead and booking management, packages, contracts with electronic signatures, invoices, crew scheduling, client galleries with optional face grouping, large-file delivery, a website builder and AI-assisted tools. The features available to you depend on your Plan and Add-ons, as described on our pricing page at the time you subscribe. The Service is intended for business and professional use.'] },
      { h2: '3. Eligibility and your account', ul: [
        'You must be at least 18 years old, able to enter into a binding contract, and not barred from using the Service under the laws that apply to you.',
        'If you use the Service on behalf of a business, you confirm that you have authority to bind that business, and "you" includes it.',
        'You must give accurate, current and complete information and keep it up to date.',
        'You are responsible for keeping your password, sign-in codes and devices secure, and for everything done through your account, including by team members and crew you add.',
        `Tell us promptly at ${CONTACT} if you believe your account has been accessed without permission. We are not liable for loss caused by unauthorised use of your credentials.`,
        'One person or business may not hold multiple accounts to obtain repeated free trials or to avoid limits.',
      ] },
      { h2: '4. Plans, free trials and prices', ul: [
        'The Free Plan has no charge. Paid Plans and Add-ons are billed in advance, monthly or yearly, as you choose.',
        'Essential and Pro begin with a free trial (currently 30 days) that needs no payment card. Studio has no free trial and is charged from the day you choose it. We may change or end trial offers for new sign-ups at any time.',
        'If you choose a paid Plan during a trial, billing begins when the trial ends. If a trial ends without a paid Plan, your account moves to the Free Plan: your inquiry form, leads and packages keep working, and paid features stop until you subscribe.',
        'Prices are shown on our pricing page. In the countries we list, prices are fixed in the local currency and you are charged exactly the amount shown; elsewhere prices are in US dollars. Your bank or card issuer may apply its own conversion or fees.',
        'Taxes (such as sales tax, VAT or GST) are added where the law requires and are your responsibility unless we state that a price includes them.',
        'Storage counts everything iwopo keeps for your account: your original files and the viewing copies iwopo makes of each photo and video (a full-screen version and a thumbnail) so your Clients can view them quickly. Your storage meter shows the total.',
      ] },
      { h2: '5. Payment, renewal and price changes', ul: [
        'Payments are processed by Stripe. By subscribing you authorise us, through Stripe, to charge your payment method for the Plan, Add-ons and applicable taxes at the start of each Paid Period. We do not store your full card details.',
        'Subscriptions renew automatically for the same period until you turn auto-renew off in Settings → Account or cancel in Plans → Manage billing.',
        'Add-ons are charged for the remainder of the current Paid Period when added and then renew with your Plan. When you remove one, it stays active until the end of the period you have paid for.',
        'A price you have paid is not changed during your current Paid Period. If we change the price of your Plan or Add-on for a later period, we will tell you by email or in the Service at least 30 days before the renewal it applies to, and you may cancel before then.',
        'If a payment fails, we may retry it, ask you to update your payment method, and limit paid features or move the account to the Free Plan until the amount due is paid.',
        'Referral credits and promotional offers have no cash value, cannot be transferred, and are subject to the conditions shown when they are offered. We may withdraw them where we reasonably suspect abuse.',
      ] },
      { h2: '6. Cancellation and refunds', p: [
        'You may cancel at any time, without contacting us, by turning auto-renew off or cancelling in Manage billing. Cancellation takes effect at the end of the current Paid Period; until then you keep full access to what you paid for.',
        'Except where the law where you live requires otherwise, payments are non-refundable, including for partially used periods, unused features, or accounts you stop using. Details, including how we handle billing errors, are in our Refund & Cancellation Policy.',
      ] },
      { h2: '7. Your Content and the licence you give us', ul: [
        'You keep all ownership rights in your Content. iwopo does not claim ownership of it.',
        'You grant iwopo a worldwide, non-exclusive, royalty-free licence to host, store, copy, process, transmit and display your Content solely to operate, secure, maintain and improve the reliability of the Service for you, and as you direct (for example showing a gallery to the Clients you share it with). This licence ends when the Content is deleted from our systems, subject to backups described below.',
        'You represent that you own your Content or have all rights, licences, releases and consents needed to upload and share it — including from the people who appear in your photos and videos and from your Clients for the information you keep about them.',
        'You are responsible for the accuracy, legality and appropriateness of your Content, and for keeping your own copies of anything important. The Service is not a substitute for your own backups.',
        'We do not sell your Content or use it to train AI models for others.',
      ] },
      { h2: '8. Your Clients and their personal information', ul: [
        'For personal information about your Clients, you are the "controller" (or "business") that decides why and how it is used, and iwopo acts as your "processor" (or "service provider"), handling it only on your instructions — that is, as needed to provide the Service to you.',
        'You are responsible for giving your Clients any notices, and obtaining any consents, that the law requires, and for answering their requests about their information. We will give you reasonable help to do so.',
        'We keep Client information confidential, apply appropriate technical and organisational security, limit access to people and providers who need it to run the Service (listed in our Privacy Policy), and require those providers to protect it.',
        'If we become aware of a security incident affecting your Clients\' personal information, we will notify you without undue delay and give you the information you reasonably need.',
        'On termination, Client information is deleted as described in section 16.',
      ] },
      { h2: '9. Contracts, electronic signatures and payments between you and your Clients', p: [
        'The Service lets you prepare agreements and collect electronic signatures. For each signature it records the signer\'s name, the date and time, the IP address and the device used, and keeps a fixed copy of the signed document with a digital fingerprint. You are responsible for the wording of your contracts, packages and invoices, for their suitability and enforceability under the law that applies to you and your Clients, and for keeping any records the law requires. iwopo does not give legal, tax or accounting advice and is not a party to any agreement between you and your Clients.',
        'Your Clients pay you directly. If you connect your own Stripe account, card payments are made on that account under Stripe\'s terms; the money goes to you, and refunds, chargebacks and disputes are yours to handle. iwopo does not receive, hold or control those funds and only records that a payment was made.',
      ] },
      { h2: '10. Face grouping and AI features', ul: [
        'Gallery face grouping creates face measurements from gallery photos (and from a selfie a guest chooses to upload) so that photos of the same person can be found together. It runs on iwopo\'s servers and, when they are busy, on Amazon Rekognition. The measurements are used only for that gallery and are deleted when the gallery is deleted.',
        'Because face measurements may be treated as biometric information in some places, you are responsible for telling the people in your galleries and obtaining any consent the law requires before you turn the feature on. You can leave it off.',
        'AI features (such as the chat assistant) generate text automatically. Output may be inaccurate or incomplete; review it before relying on it or sending it to a Client. You are responsible for how you use it.',
        'Content is sent to an AI provider only when an AI feature is used, and only what that feature needs.',
      ] },
      { h2: '11. Acceptable use', ul: [
        'Do not use the Service to break the law or to infringe anyone\'s intellectual-property, privacy or other rights.',
        'Do not upload content that is unlawful, defamatory, harassing, sexually exploitative of minors, or that you have no right to share.',
        'Do not send spam or unsolicited bulk messages, or deceive or defraud anyone.',
        'Do not upload viruses or malicious code, probe or attack the Service, attempt to access other accounts or data, or get around security, usage limits or billing.',
        'Do not copy, resell, sublicense or reverse engineer the Service, or use it to build a competing product, except as the law allows.',
        'Do not use automated means to scrape or overload the Service.',
        'We may investigate suspected breaches and remove content or suspend accounts as described in section 15.',
      ] },
      { h2: '12. Third-party services and integrations', p: ['The Service works with services provided by others — for example Stripe for payments, and any email, calendar, phone or domain service you choose to connect. Your use of those services is governed by their own terms and privacy policies. We are not responsible for them, for their availability, or for what they do with information you send them.'] },
      { h2: '13. Your own domain and addresses', p: ['iwopo may give your account a web address (such as yourname.iwopo.com) and, on Plans that include it, let you connect a domain you own. You are responsible for your domain, its registration and its DNS settings. We may change, reclaim or withdraw an iwopo address that is misleading, infringes someone\'s rights, has been unused, or is needed for the operation of the Service.'] },
      { h2: '14. Our intellectual property and your feedback', p: [
        'The Service, including its software, design, text, logos and trademarks, belongs to iwopo and its licensors and is protected by law. Subject to these Terms and payment of applicable fees, we grant you a limited, non-exclusive, non-transferable, revocable right to use the Service for your business. All rights not expressly granted are reserved.',
        'If you send us suggestions or feedback, you agree that we may use them without restriction or payment.',
      ] },
      { h2: '15. Suspension and termination', ul: [
        'You may stop using the Service at any time and may ask us to delete your account.',
        'We may suspend or limit an account, with notice where reasonable, if we reasonably believe it is being used in breach of these Terms or the law, puts the Service or other users at risk, or has unpaid amounts.',
        'We may terminate an account for a serious or repeated breach. Where the breach can be corrected, we will normally give you notice and a chance to correct it first.',
        'We may also stop offering the Service. If we do, we will give paying customers at least 30 days\' notice and a pro-rata refund of any prepaid period after the end date.',
      ] },
      { h2: '16. What happens to your Content when an account ends', ul: [
        'If your trial ends or your Plan lapses, your account moves to the Free Plan and your Content is kept, so you can return by choosing a Plan.',
        'If your files exceed what your Plan and Add-ons allow (for example after moving to a smaller Plan), you have 15 days to delete some or choose a larger Plan. After that your galleries and files are locked — not viewable or downloadable by you or your Clients — until you are within your limit. You can still delete files while they are locked.',
        'If no one signs in to a Free Plan account for 6 months we email you; if no one signs in within the following month, its leads, packages, galleries and files are removed. The account itself is kept so you can sign in again. Accounts on a paid Plan are never removed this way.',
        `You may ask us to delete your account at any time at ${CONTACT}. Deleted Content is removed from our live systems promptly and from backups within a reasonable period.`,
        'On a paid Plan you can download your Content at any time. On the Free Plan we provide a copy on request.',
      ] },
      { h2: '17. Availability, support and changes to the Service', p: ['We work to keep the Service available and secure, but we do not promise that it will be uninterrupted or error-free. It may be unavailable for maintenance, updates, or reasons beyond our control. We continually improve the Service and may add, change or remove features. If a change materially reduces the features of a Plan you have paid for, we will tell you in advance and you may cancel. Support is provided by email; priority support is included where your Plan says so.'] },
      { h2: '18. Disclaimers', p: [
        'To the fullest extent the law allows, the Service is provided "as is" and "as available", without warranties of any kind, whether express, implied or statutory, including implied warranties of merchantability, fitness for a particular purpose, title and non-infringement. We do not warrant that the Service will meet your requirements, that Content will never be lost, or that any contract or document you create with it will be legally effective for your purposes.',
      ] },
      { h2: '19. Limitation of liability', p: [
        'To the fullest extent the law allows, iwopo and its owners, employees and suppliers will not be liable for any indirect, incidental, special, consequential, exemplary or punitive damages, or for lost profits, revenue, business, goodwill or data, arising out of or relating to the Service or these Terms, even if advised that such damages are possible.',
        'To the fullest extent the law allows, our total liability for all claims arising out of or relating to the Service or these Terms is limited to the amount you paid iwopo for the Service in the 12 months before the event giving rise to the claim, or US$100 if you paid nothing.',
        'Nothing in these Terms limits liability that cannot be limited by law, such as liability for fraud or for death or personal injury caused by negligence. Some places do not allow certain exclusions, so some of the above may not apply to you.',
      ] },
      { h2: '20. Indemnity', p: ['You agree to defend, indemnify and hold harmless iwopo and its owners, employees and suppliers from and against any claims, damages, losses and expenses (including reasonable legal fees) arising from your Content, your dealings and agreements with your Clients, your use of the Service in breach of these Terms, or your violation of any law or of anyone\'s rights.'] },
      { h2: '21. Governing law and disputes', p: [
        'These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-law rules. Subject to the next paragraph, the state and federal courts located in Delaware have exclusive jurisdiction over any dispute, and you and iwopo consent to that jurisdiction.',
        `Before starting any formal proceeding, each of us agrees to try to resolve the dispute informally by writing to the other (to us at ${CONTACT}) and allowing 30 days for a resolution. If you are a consumer, nothing in these Terms removes protections or rights that the laws where you live give you and that cannot be waived by agreement.`,
      ] },
      { h2: '22. General', ul: [
        'Entire agreement: these Terms and the policies they refer to are the whole agreement between you and iwopo about the Service and replace any earlier understanding.',
        'Severability: if any part of these Terms is found unenforceable, the rest remains in effect.',
        'No waiver: a failure to enforce a right is not a waiver of it.',
        'Assignment: you may not transfer these Terms without our written consent; we may transfer them to an affiliate or in connection with a merger, acquisition or sale of assets.',
        'Force majeure: neither of us is liable for failure or delay caused by events beyond reasonable control, such as outages of utilities or third-party networks, natural events, or government action.',
        'Compliance: you may not use the Service if you are located in, or are a national or resident of, a country or on a list where US law prohibits it.',
        'Notices: we may send notices to the email address on your account or within the Service. Send notices to us at the address below.',
        'Survival: sections that by their nature should survive termination (including 7, 14 and 18 to 22) do so.',
      ] },
      { h2: '23. Changes to these Terms', p: [`We may update these Terms from time to time. If a change is material, we will tell you by email or in the Service at least 30 days before it takes effect. Continuing to use the Service after a change takes effect means you accept it; if you do not agree, you may cancel before then. The date at the top of this page shows the latest version.`] },
      { h2: '24. Contact', p: [`${COMPANY}. Email: ${CONTACT}.`] },
    ],
  },

  privacy: {
    path: '/privacy', title: 'Privacy Policy | iwopo', h1: 'Privacy Policy',
    description: 'How iwopo collects, uses, shares and protects personal information — for vendors, their clients and visitors.',
    lead: `This Privacy Policy explains what personal information IWOPO, LLC ("iwopo", "we", "us") collects and receives, how and why we use it, who we share it with, how long we keep it, and the choices and rights you have. It applies to vendors who use iwopo, to the vendors' clients and guests, and to visitors to iwopo.com. Contact: ${CONTACT}.`,
    sections: [
      { h2: '1. Who is responsible for your information', ul: [
        'For vendors\' own account information and for visitors to iwopo.com, iwopo decides how the information is used. In legal terms we are the "controller" (or "business").',
        'For information that vendors keep in iwopo about their clients and guests — inquiries, contracts, invoices, galleries, files — the vendor decides how it is used and iwopo handles it on the vendor\'s behalf. In legal terms the vendor is the controller and we are the "processor" (or "service provider").',
        'If you are a client or guest of a vendor, please contact that vendor first about your information. We will help the vendor respond, and you may also write to us.',
      ] },
      { h2: '2. Information we collect', ul: [
        'Account and profile: name, business name, email address, phone number, password (stored only as a secure one-way hash), country, time zone, currency and settings.',
        'Billing: the Plan and Add-ons you choose, your billing history, and the type and last four digits of your card. Card numbers are entered on Stripe\'s pages and handled by Stripe; we never see or store full card numbers.',
        'Content vendors add: client names and contact details, event details, messages and notes, packages, contracts and signatures, invoices and payment records, photos, videos and files.',
        'Signature records: when a contract is signed we record the signer\'s name, the date and time, the IP address and the device and browser used, and keep a fixed copy of the signed document, as evidence of the signature.',
        'Gallery face grouping: when a vendor uses this feature, face measurements are created from gallery photos, and from a selfie a guest chooses to upload, in order to group photos of the same person. See section 7.',
        'Security and usage: sign-in events, trusted devices, IP addresses, browser and device type, when an account was last used, and technical logs needed to keep iwopo secure and working.',
        'Approximate location: your country, worked out from your IP address on our own servers, to show prices in your currency. We do not collect precise location.',
        'Communications: emails and messages you send us, and your marketing preference.',
        'Waitlist: if you ask to be told when iwopo opens, the email address you give us.',
      ] },
      { h2: '3. Where the information comes from', ul: [
        'Directly from you, when you create an account, fill in a form, upload content or write to us.',
        'From vendors, about their clients and guests.',
        'Automatically from your device when you use iwopo (the security and usage information above).',
        'From our payment processor, about whether a payment succeeded.',
      ] },
      { h2: '4. How we use information, and our legal bases', ul: [
        'To provide the Service — accounts, sign-in, the vendor\'s tools and the pages their clients use (performance of our contract with the vendor).',
        'To bill subscriptions, collect payment and keep financial records (contract; legal obligation).',
        'To keep accounts and the Service secure, prevent fraud and abuse, and enforce our Terms — for example two-step sign-in (legitimate interests; legal obligation).',
        'To send service messages: sign-in codes, receipts, security alerts and notices about your account or these policies (contract; legitimate interests).',
        'To send news and offers about iwopo, only where you have agreed, and you can opt out at any time (consent).',
        'To fix problems, understand how features are used in aggregate, and improve the Service (legitimate interests).',
        'To comply with law and respond to lawful requests (legal obligation).',
        'We do not sell personal information, we do not share it for cross-context behavioural advertising, and we do not use it for third-party advertising.',
      ] },
      { h2: '5. Who we share information with', ul: [
        'Service providers that help us run iwopo, each limited to what it needs and bound to protect the information: Hostinger (servers and database, United States); Cloudflare R2 and Amazon Web Services (storage of photos, videos and files); Google Workspace (sending email); Stripe (subscription payments, and card payments vendors take on their own connected accounts); Amazon Rekognition (backup face grouping when our own servers are busy); Anthropic and Google Gemini (AI features, only when one is used and only what it needs); ExchangeRate-API (daily exchange rates — no personal information is sent).',
        'The vendor, for information about the vendor\'s own clients and guests; and the people a vendor chooses to share a gallery, contract, invoice or file with.',
        'Services a vendor chooses to connect, such as their own email, phone or payment account.',
        'Authorities or other parties where the law requires it, or where needed to protect the rights, property or safety of iwopo, our users or others.',
        'A successor, if iwopo is involved in a merger, acquisition or sale of assets; we will tell account holders before their information becomes subject to a different privacy policy.',
      ] },
      { h2: '6. International transfers', p: ['iwopo is operated from the United States, and our providers may process information in the United States and other countries whose laws may differ from those where you live. Where the law requires it — for example for people in the European Economic Area, the United Kingdom or Canada — we rely on appropriate safeguards for these transfers, such as standard contractual clauses.'] },
      { h2: '7. Face grouping (biometric information)', ul: [
        'Face grouping is optional and is turned on by the vendor for a gallery.',
        'It creates numerical face measurements from the gallery\'s photos, and from a selfie a guest chooses to upload, solely to group photos of the same person in that gallery and to let a guest find their own photos.',
        'Processing runs on iwopo\'s own servers; when they are busy, a gallery may be processed by Amazon Rekognition instead.',
        'The measurements are never sold, never used to identify people outside that gallery, and never used for advertising.',
        'They are deleted — including any copy held by Amazon — when the gallery is deleted. A vendor can also turn the feature off.',
        'The vendor is responsible for informing the people in the gallery and obtaining any consent the law requires.',
      ] },
      { h2: '8. AI features', p: ['When a vendor or their client uses an AI feature, such as the chat assistant, the text needed for that request is sent to our AI provider to produce a reply. We do not use your content to train AI models for others. AI output is generated automatically and may be inaccurate; iwopo does not use it to make decisions that have legal or similarly significant effects on people.'] },
      { h2: '9. How long we keep information', ul: [
        'Account information and Content: for as long as the account exists.',
        'Free Plan accounts no one has signed in to for 7 months (after an email at 6 months): the leads, packages, galleries and files are removed; the account itself is kept.',
        'Signed contracts and their signature records: kept with the account as evidence of the agreement.',
        'Billing records: for as long as tax and accounting laws require.',
        'Security logs: for a limited period, then deleted or anonymised.',
        'Deleted items: removed from our live systems promptly and from backups within a reasonable period.',
        'Vendors can delete their clients\' information, galleries and files at any time.',
      ] },
      { h2: '10. How we protect information', p: ['Connections to iwopo are encrypted in transit (HTTPS). Passwords are stored only as secure hashes. Sign-in can require a code sent by email, and devices can be reviewed and removed. Each vendor\'s data is kept separate from every other vendor\'s, and this separation is tested automatically. Access is limited to the people and services that need it. No system can be guaranteed completely secure; if a breach affects your personal information, we will notify you and the relevant authorities as the law requires.'] },
      { h2: '11. Your rights and choices', ul: [
        'Depending on where you live, you may have the right to access the personal information we hold about you, to correct it, to delete it, to receive a copy in a portable form, to object to or restrict certain uses, and to withdraw consent where we rely on it.',
        'European Economic Area and United Kingdom (GDPR / UK GDPR): you also have the right to complain to your local data-protection authority.',
        'Canada (PIPEDA and provincial laws): you may ask about our practices and challenge our compliance, and complain to the Office of the Privacy Commissioner of Canada.',
        'California and other US states: you have the right to know, delete and correct personal information and not to be discriminated against for using your rights. We do not sell personal information or share it for cross-context behavioural advertising.',
        `To use any of these rights, write to ${CONTACT}. We will verify your request and answer within the time the law requires. You may use an authorised agent where the law allows.`,
        'If your information is held by a vendor (for example in a gallery or a contract), we will pass your request to that vendor and help them respond.',
        'You can opt out of marketing emails at any time using the link in the email or in your settings. Service messages about your account cannot be turned off.',
      ] },
      { h2: '12. Children', p: ['iwopo accounts are for adults and we do not knowingly collect personal information from children to create accounts. Photos and videos in a vendor\'s galleries may include children; the vendor is responsible for having the right and any permission needed to store and share them. If you believe a child\'s information has been provided to us improperly, write to us and we will act on it.'] },
      { h2: '13. Cookies and similar technologies', p: ['iwopo does not use advertising cookies or third-party tracking tools. It stores only what the app needs to work, such as your sign-in session and preferences. See our Cookie Policy for details.'] },
      { h2: '14. Changes to this policy', p: ['We may update this policy to reflect changes in the Service or the law. We will post the new version here, change the date at the top, and tell account holders about material changes by email or in the Service before they take effect.'] },
      { h2: '15. Contact', p: [`Questions or requests about privacy: ${CONTACT}. Postal address: ${COMPANY}.`] },
    ],
  },

  refunds: {
    path: '/refund-policy', title: 'Refund & Cancellation Policy | iwopo', h1: 'Refund & Cancellation Policy',
    description: 'Free trials, cancelling an iwopo plan, plan changes, failed payments and refunds.',
    lead: 'This policy explains how free trials, renewals, cancellations, plan changes and refunds work for iwopo subscriptions. In short: you can try Essential or Pro free, you can cancel at any time yourself, you keep what you paid for until the end of the period, and payments are not refunded except where this policy or the law says otherwise. It forms part of our Terms of Service.',
    sections: [
      { h2: '1. Free trial', ul: [
        'Essential and Pro start with a free trial (currently 30 days). No payment card is needed to start it, and you are not charged during it.',
        'Studio has no free trial and is charged from the day you choose it.',
        'Choosing a paid Plan during a trial does not shorten the trial: billing begins when the trial ends.',
        'If a trial ends and you have not chosen a paid Plan, your account moves to the Free Plan automatically. You are not charged, and your content is kept.',
        'A trial is offered once per person or business.',
      ] },
      { h2: '2. Billing and automatic renewal', ul: [
        'Paid Plans and Add-ons are billed in advance for each month or year, in the currency shown at checkout.',
        'Your subscription renews automatically at the end of each period, at the price that applies to your subscription, until you turn auto-renew off or cancel.',
        'The price you have paid is not changed during your current paid period. If a price will change for a later period, we tell you at least 30 days before the renewal it applies to.',
        'You can see your next renewal date, your payment method and your invoices in Plans → Manage billing.',
      ] },
      { h2: '3. How to cancel', ul: [
        'Turn auto-renew off in Settings → Account, or cancel in Plans → Manage billing. You can do this yourself at any time; you do not need to contact us or give a reason.',
        'To avoid being charged for the next period, cancel before your renewal date.',
        `If you cannot access your account, write to ${CONTACT} from the email address on the account and we will cancel it for you.`,
      ] },
      { h2: '4. What happens after you cancel', ul: [
        'Your Plan and Add-ons stay active until the end of the month or year you have already paid for. You keep full access until then.',
        'At the end of that period the subscription does not renew and the account moves to the Free Plan. No further charges are made.',
        'Your content is kept after that, so you can return by choosing a Plan. If your files are more than the Free Plan allows, the storage rules in our Terms of Service apply (you have 15 days to reduce them or choose a Plan before galleries and files are locked).',
        'You can reverse a cancellation at any time before the period ends by turning auto-renew back on.',
      ] },
      { h2: '5. Refunds', ul: [
        'Payments are non-refundable. This includes partially used months or years, unused features or storage, Add-ons, and accounts you stop using, because you keep full access until the end of the period you paid for.',
        'We do not give refunds or credits for downgrading during a paid period, except as described under "Changing plans" below.',
        'Taxes are refunded only where the underlying payment is refunded.',
      ] },
      { h2: '6. When we do refund', ul: [
        'Billing errors: if you were charged twice, charged the wrong amount, or charged after a cancellation that was made before the renewal date, we will correct it and refund the amount charged in error.',
        'Discontinued service: if we stop offering the Service, we refund any prepaid period after the end date, pro rata.',
        'Legal rights: where the law where you live gives you a right to a refund or to withdraw from a purchase that cannot be waived, that right applies and nothing in this policy limits it.',
        `To ask for a correction, write to ${CONTACT} within 60 days of the charge with the email on your account and the date and amount of the charge. Approved refunds are returned to the original payment method, usually within 5 to 10 business days depending on your bank.`,
      ] },
      { h2: '7. Changing plans', ul: [
        'Upgrading takes effect immediately. Stripe charges the difference for the time remaining in your current period.',
        'Downgrading through Manage billing is adjusted automatically by Stripe for the time remaining; any credit is applied to your future invoices rather than paid out.',
        'If you move to a Plan with less storage than you are using, the storage rules in our Terms of Service apply.',
      ] },
      { h2: '8. Add-ons', ul: [
        'An Add-on is charged for the remainder of your current period when you add it, and then renews with your Plan.',
        'When you remove an Add-on it stays active until the end of the period you have paid for, and is not charged again. It is not refunded for the remaining time.',
      ] },
      { h2: '9. Failed payments', ul: [
        'If a renewal payment fails, we may retry it and will ask you to update your payment method.',
        'If it remains unpaid, paid features may be limited and the account may be moved to the Free Plan. Your content is kept as described in our Terms of Service.',
      ] },
      { h2: '10. Chargebacks and payment disputes', p: [`If you believe a charge is wrong, please write to ${CONTACT} first — we can usually resolve it faster than a bank dispute. If a chargeback is opened for a charge that was correctly made under these terms, we may suspend the account while it is reviewed and provide the bank with the records needed to respond.`] },
      { h2: '11. Referral credits and promotions', p: ['Free months and other credits from referrals or promotions are applied to future invoices. They have no cash value and are not refunded or paid out.'] },
      { h2: '12. Payments between vendors and their clients', p: ['This policy covers only what you pay iwopo for your subscription. Deposits, balances and other payments between a vendor and their clients are governed by the agreement between them; iwopo does not hold those funds and cannot refund them. Clients should contact the vendor.'] },
      { h2: '13. Contact', p: [`Questions about billing, cancellation or refunds: ${CONTACT}. ${COMPANY}.`] },
    ],
  },

  cookies: {
    path: '/cookies', title: 'Cookie Policy | iwopo', h1: 'Cookie Policy',
    description: 'What iwopo stores in your browser, why, for how long — and what it does not use.',
    lead: 'This Cookie Policy explains what iwopo stores on your device when you use iwopo.com, the iwopo app, or a page a vendor publishes with iwopo (such as an inquiry form or a gallery). In short: iwopo does not use advertising cookies or third-party trackers. It stores only what is needed for the app to work and to keep your account secure.',
    sections: [
      { h2: '1. What cookies and browser storage are', p: ['Cookies are small text files a website saves in your browser. Websites can also keep small pieces of information in your browser\'s "local storage" and "session storage". This policy uses "stored items" for all of these. They let a site remember you between pages and visits.'] },
      { h2: '2. What iwopo stores, and why', ul: [
        'Sign-in session — keeps you signed in as you move between pages. Without it you would have to sign in on every page. Kept until you sign out or the session expires.',
        'Trusted-device marker — if you choose "remember this device", lets you skip the emailed sign-in code on that device. Kept for 30 days.',
        'Preferences — your light or dark theme, time format and similar display choices. Kept until you change them or clear your browser.',
        'Security items — used to protect sign-in and forms against misuse.',
        'Work in progress — small technical items the app needs to finish what you started, for example an upload or an unsaved form. Removed when the task is done.',
        'Gallery access — on a vendor\'s gallery, remembers that you entered the gallery password so you are not asked again on every page.',
        'These items are "strictly necessary": the Service cannot work properly without them, so they do not require consent under most cookie laws. They are used by iwopo only and are not shared with advertisers.',
      ] },
      { h2: '3. What iwopo does not use', ul: [
        'No advertising or retargeting cookies.',
        'No Google Analytics, Meta (Facebook) Pixel or similar third-party analytics or tracking tools.',
        'No social-media tracking widgets.',
        'No sale or sharing of browsing information.',
        'Fonts and scripts are served from iwopo\'s own servers rather than from third-party networks.',
      ] },
      { h2: '4. Third parties that may set their own cookies', ul: [
        'Stripe: when you pay for a Plan, or pay a vendor by card, you use a page provided by Stripe, which sets its own cookies to process the payment securely and prevent fraud. Stripe\'s privacy and cookie policies apply to them.',
        'Content a vendor embeds: a vendor\'s website or page may include content from other services (for example an embedded video). Those services may set their own cookies, which iwopo does not control.',
      ] },
      { h2: '5. Your choices', ul: [
        'You can delete stored items at any time in your browser\'s settings (usually under "Privacy" or "Site data"). You will then need to sign in again and your preferences will be reset.',
        'You can set your browser to block cookies. If you block the items iwopo needs, you will not be able to sign in and some pages will not work.',
        'Because iwopo does not track you across other websites, there is no tracking to opt out of, and iwopo behaves the same way whether or not your browser sends a "Do Not Track" or Global Privacy Control signal.',
      ] },
      { h2: '6. Changes to this policy', p: ['If we change what iwopo stores in your browser, we will update this page and the date at the top. If we ever introduce stored items that are not strictly necessary, we will ask for your consent first where the law requires it.'] },
      { h2: '7. Contact', p: [`Questions about this policy: ${CONTACT}. ${COMPANY}. See also our Privacy Policy.`] },
    ],
  },
};
