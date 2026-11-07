/**
 * 👋 Getting started — once, right after a vendor's first payment (Raj, 2026-11-07): the three things that get their
 * business running, each one click away. Closing it (either way) marks it seen (POST /billing/welcome-seen).
 */
const STEPS = [
  { tab: 'settings', icon: '⚙️', title: 'Your business details', text: 'Add your logo and details, and connect your email if you want iwopo to send from your own address.' },
  { tab: 'inqform', icon: '📝', title: 'Your inquiry form', text: 'The form clients fill in to ask about their date — share it or put it on your website.' },
  { tab: 'contracts', icon: '📄', title: 'Your contract', text: 'Set up the contract clients sign online, so a booking is one step away.' },
];

export default function WelcomeSteps({ plan, onGo, onClose }) {
  return (
    <div className="ws-back" role="dialog" aria-modal="true" aria-labelledby="ws-title">
      <div className="ws">
        <span className="ws-badge">{plan}</span>
        <h2 id="ws-title" className="ws-title">Welcome to iwopo 🎉</h2>
        <p className="ws-lead">You're all set. Three quick steps get your business running:</p>
        <ol className="ws-steps">
          {STEPS.map((s, i) => (
            <li key={s.tab} className="ws-step">
              <span className="ws-n">{i + 1}</span>
              <div className="ws-body"><b>{s.icon} {s.title}</b><span>{s.text}</span></div>
              <button type="button" className="ws-go" onClick={() => onGo(s.tab)}>Open</button>
            </li>
          ))}
        </ol>
        <button type="button" className="ws-later" onClick={onClose}>I'll look around first</button>
      </div>
    </div>
  );
}
