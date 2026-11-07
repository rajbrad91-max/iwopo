/**
 * 🚀 Getting started — the first three things a new vendor sets up, in one place, so the Welcome pop-up and the
 * Help & Support guide can never disagree (Raj, 2026-11-07). tab: the panel page each step opens.
 */
export const GETTING_STARTED = [
  {
    tab: 'settings', icon: '⚙️', title: 'Your business details',
    text: 'Add your logo and details, and connect your email if you want iwopo to send from your own address.',
    points: ['Settings → your business name, logo and contact details — they appear on your forms, contracts and invoices.',
      'Optional: connect your own email so messages to clients come from your address.'],
  },
  {
    tab: 'inqform', icon: '📝', title: 'Your inquiry form',
    text: 'The form clients fill in to ask about their date — share it or put it on your website.',
    points: ['Inquiry Form → choose what clients are asked, and preview it.',
      'Copy your form link to share it, or add it to your website — every inquiry lands in Leads.'],
  },
  {
    tab: 'contracts', icon: '📄', title: 'Your contract',
    text: 'Set up the contract clients sign online, so a booking is one step away.',
    points: ['Contracts → start from the sample contract for your trade, or write your own.',
      'Then send packages from a lead: the client picks one, signs and pays the deposit in their portal.'],
  },
];
