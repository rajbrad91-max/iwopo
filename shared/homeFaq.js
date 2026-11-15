/**
 * ❓ The home page's questions and answers — ONE list, read by the page itself (frontend/src/pages/home/HomeDark.jsx)
 * and by what Google and AI assistants are given (backend/src/lib/seoContent.js), so the two can never disagree
 * (Raj, 2026-11-15).
 *
 * ⚠️ No prices, plan names or trial lengths here: plans change in the database, and these words are public and indexed.
 */
export const HOME_FAQ = [
  ['Is there a free trial?', 'Yes. You can start with a free trial, no card needed. When it ends, you choose a plan to keep going.'],
  ['Is iwopo only for photographers?', 'No. Planners, DJs, florists, make-up artists, caterers, cake makers and every other wedding business use the same tools; galleries are there for those who deliver photos and films.'],
  ['Which countries is iwopo available in?', 'Every country. iwopo runs in any browser, each business sets its own time zone and currency, and clients can pay deposits the way they already pay locally.'],
  ['Are my clients’ galleries private?', 'Yes. Every gallery is private, with share links, passwords and download controls you set.'],
  ['Do payments go to me?', 'Deposits and balances paid online go straight to your own Stripe account.'],
  ['Is my data secure?', 'Accounts are protected by two-step sign-in on new devices, every business’s data is kept separate, and connections are encrypted.'],
  ['What happens to my files if I leave?', 'They are yours. You can download your galleries any time.'],
];
