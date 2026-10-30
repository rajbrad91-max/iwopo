import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './securityLog.css';

/**
 * 🛡️ Settings → Security (2026-10-30): this account's own sign-ins, wrong passwords, lock-outs and password changes,
 * newest first — so a vendor can spot a sign-in that wasn't them. The server returns only the signed-in account's
 * events (GET /api/me/security).
 */
const EVENTS = {
  login_ok: ['✅', 'Signed in'],
  login_failed: ['⚠️', 'Wrong password'],
  login_locked: ['⛔', 'Sign-in paused — too many wrong tries'],
  password_changed: ['🔑', 'Password changed'],
  password_reset: ['🔑', 'Password reset with an email link'],
  email_confirmed: ['✉️', 'Email confirmed'],
  two_step_sent: ['✉️', 'Sign-in code emailed'],
  two_step_failed: ['⚠️', 'Wrong sign-in code'],
  device_remembered: ['📱', 'Device remembered for 30 days'],
};

const when = (iso) => new Date(iso).toLocaleString(undefined, {
  timeZone: localStorage.getItem('vf_timezone') || undefined,
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function SecurityLog() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.securityLog().then(d => setEvents(d.events || [])).catch(e => { setError(e.message); setEvents([]); });
  }, []);

  return (
    <div className="table-wrap sl-wrap">
      <h2 className="sl-title">🛡️ Security</h2>
      <p className="sl-sub">Sign-ins and password changes on your account over the last 180 days. Don&apos;t recognise one? Change your password in <b>🔐 Account</b> — every other device is signed out straight away.</p>
      {error && <p className="sl-error">⚠️ {error}</p>}
      {events === null && <p className="sl-empty">Loading…</p>}
      {events?.length === 0 && !error && <p className="sl-empty">Nothing recorded yet.</p>}
      {events?.length > 0 && (
        <ul className="sl-list">
          {events.map((e, i) => {
            const [icon, label] = EVENTS[e.event] || ['•', e.event];
            return (
              <li key={i} className={`sl-row sl-${e.event}`}>
                <span className="sl-icon" aria-hidden="true">{icon}</span>
                <span className="sl-what">{label}</span>
                <span className="sl-when">{when(e.created_at)}</span>
                <span className="sl-device">{e.device || '—'}{e.ip ? ` · ${e.ip}` : ''}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
