/**
 * 🔔 The bells in Super Admin’s header: support, payments and trials.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

export function AdminBells({ goView }) {
  const [c, setC] = useState({ messages: 0, paid: 0, trials: 0 });
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // 🔄 live every 30s
    return () => clearInterval(t);
  }, []);
  function load() { api.adminCounts().then(setC).catch(() => {}); }

  async function open(group, view) {
    try { await api.markCountSeen(group); } catch {}
    setC(x => ({ ...x, [group]: 0 }));
    goView(view);
  }

  // 🔔 each top-bar button: its own icon on a tile tinted in its colour (Raj, 2026-11-05 — the emoji didn't say what they were)
  const Bell = ({ icon, tone, n, title, onClick }) => (
    <button className={`sa-bell sa-bell-${tone}`} title={title} aria-label={title} onClick={onClick}>
      {icon}
      {n > 0 && <span className="sa-bell-badge">{n}</span>}
    </button>
  );

  return (
    <div className="sa-bells">
      <Bell icon={<SupportIcon />} tone="support" n={c.messages} title="Support messages" onClick={() => open('messages', 'support')} />
      <Bell icon={<PaidIcon />} tone="paid" n={c.paid} title="New paid subscribers" onClick={() => open('paid', 'buyers')} />
      <Bell icon={<TrialIcon />} tone="trial" n={c.trials} title="New trial subscribers" onClick={() => open('trials', 'buyers')} />
    </div>
  );
}

/* 🎧 💲 🎟️ The top-bar icons — two-tone line drawings (outline in the button's colour, one part filled with its tint).
   Support: a headset. New paid: a person with a dollar sign. New trial: a person with a ticket where the "+" would be. */
const SupportIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 14v-3a8 8 0 1 1 16 0v3" />
    <path d="M18 19c0 1.657 -2.686 3 -6 3" />
    <path className="tw" d="M4 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2z" />
    <path className="tw" d="M15 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2z" />
  </svg>
);
const PaidIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path className="tw" d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
    <path d="M6 21v-2a4 4 0 0 1 4 -4h3" />
    <path d="M21 15h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5" />
    <path d="M19 21v1m0 -8v1" />
  </svg>
);
const TrialIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path className="tw" d="M7 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
    <path d="M5 21v-2a4 4 0 0 1 4 -4h2" />
    <path className="tw" d="M14.5 14.5h6.5a1 1 0 0 1 1 1v1.25a1.25 1.25 0 0 0 0 2.5v1.25a1 1 0 0 1 -1 1h-6.5a1 1 0 0 1 -1 -1v-1.25a1.25 1.25 0 0 0 0 -2.5v-1.25a1 1 0 0 1 1 -1z" />
    <path d="M18.5 15.5v.6m0 1.9v.6m0 1.9v.4" />
  </svg>
);
