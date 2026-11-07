import { GETTING_STARTED } from '../lib/gettingStarted';
/**
 * 👋 Getting started — once, right after a vendor's first payment (Raj, 2026-11-07): the three things that get their
 * business running, each one click away. Closing it (either way) marks it seen (POST /billing/welcome-seen).
 */

export default function WelcomeSteps({ plan, onGo, onClose }) {
  return (
    <div className="ws-back" role="dialog" aria-modal="true" aria-labelledby="ws-title">
      <div className="ws">
        <span className="ws-badge">{plan}</span>
        <h2 id="ws-title" className="ws-title">Welcome to iwopo 🎉</h2>
        <p className="ws-lead">You're all set. Three quick steps get your business running:</p>
        <ol className="ws-steps">
          {GETTING_STARTED.map((s, i) => (
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
