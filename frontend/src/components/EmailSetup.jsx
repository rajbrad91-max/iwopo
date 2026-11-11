import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import PasswordInput from './PasswordInput';
import './emailSetup.css';

/**
 * 📧 Settings → Setup Email: how a vendor's emails reach their clients, and where new-lead alerts go (Raj, 2026-11-11).
 * Each way is a card with a one-line explanation; picking one marks it with the teal outline and dot and opens its own
 * settings under it, folding the others. Every box has a plain title and a "?" that shows what it is and where to get
 * it (hover, tap or keyboard focus). Saving is unchanged: the same settings object to the same endpoint
 * (api.emailSettings / api.saveEmailSettings, backend routes/email.js). The SMTP boxes tell the browser not to
 * auto-fill the vendor's own login into them — the password here is an app password, not their sign-in password.
 */
const MODES = [
  { mode: 'smtp', label: '🔧 My own SMTP', hint: 'Clients get your emails from your own address, like info@yourstudio.com.' },
  { mode: 'self', label: '📥 Self-receive', hint: 'iwopo does not email clients for you — you reply to them from your own inbox.' },
  { mode: 'platform', label: '🏢 Platform email', hint: 'Clients get your emails from iwopo’s no-reply address. Nothing to set up.' },
];

// what the server sends back for a saved app password — a stand-in, never the real one (routes/email.js)
const SAVED_PASSWORD = '••••••';

const HELP = {
  smtp_host: 'Your email company’s sending server. Gmail or Google Workspace: smtp.gmail.com · Outlook or Microsoft 365: smtp.office365.com. For others, search their help pages for “SMTP server”.',
  smtp_port: 'The door that server uses for sending. Use 587 — it works for Gmail and most companies. Change it only if your email company says so (465 is the other common one).',
  smtp_user: 'Usually your full email address — the one you send from, like info@yourstudio.com.',
  smtp_pass: 'Not your normal sign-in password: an app password made just for iwopo. Gmail or Google Workspace: myaccount.google.com → Security → 2-Step Verification → App passwords → create one named “iwopo”, then paste the 16 letters here.',
  from_name: 'The name clients see in their inbox — usually your studio’s name.',
  from_email: 'The address clients see and reply to. Usually the same as your login email.',
  notify_email: 'Where iwopo emails you the moment a new inquiry arrives. Use the inbox you check most.',
};

/** a title with a "?" that explains the box — shown on hover, on tap and on keyboard focus */
function Field({ id, label, children }) {
  return (
    <div className="es-field">
      <div className="es-label-row">
        <label className="es-label" htmlFor={`es-${id}`}>{label}</label>
        <span className="es-help">
          <button type="button" className="es-help-btn" aria-label={`What is ${label}?`} aria-describedby={`es-tip-${id}`}>?</button>
          <span className="es-tip" role="tooltip" id={`es-tip-${id}`}>{HELP[id]}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

export default function EmailSetup() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.emailSettings().then(d => setS(d.settings)).catch(() => setS({ mode: 'platform' }));
  }, []);

  async function save() {
    setMsg('');
    try { await api.saveEmailSettings(s); setMsg('✅ Saved'); setTimeout(() => setMsg(''), 1500); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  if (!s) return null;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  return (
    <div className="table-wrap es">
      <h2 className="es-title">📧 Email sending {msg && <span className="es-msg">{msg}</span>}</h2>

      <p className="es-hint">How do you want to email clients?</p>
      <div className="es-modes">
        {MODES.map(({ mode, label, hint }) => {
          const on = s.mode === mode;
          return (
            <div key={mode} className={`es-mode${on ? ' is-on' : ''}`}>
              <button type="button" className="es-mode-head" aria-pressed={on} onClick={() => setS({ ...s, mode })}>
                <span className="es-dot" aria-hidden="true" />
                <span className="es-mode-text">
                  <span className="es-mode-label">{label}</span>
                  <span className="es-hint">{hint}</span>
                </span>
              </button>
              {on && mode === 'smtp' && (
                <div className="es-mode-body">
                  <Field id="smtp_host" label="Sending server (SMTP)">
                    <input id="es-smtp_host" className="es-input" placeholder="smtp.gmail.com" autoComplete="off" value={s.smtp_host || ''} onChange={set('smtp_host')} />
                  </Field>
                  <Field id="smtp_port" label="Server port">
                    <input id="es-smtp_port" className="es-input" type="number" placeholder="587" autoComplete="off" value={s.smtp_port || 587} onChange={e => setS({ ...s, smtp_port: Number(e.target.value) })} />
                  </Field>
                  <Field id="smtp_user" label="Login email">
                    <input id="es-smtp_user" className="es-input" placeholder="info@yourstudio.com" autoComplete="off" value={s.smtp_user || ''} onChange={set('smtp_user')} />
                  </Field>
                  <Field id="smtp_pass" label="App password">
                    <PasswordInput id="es-smtp_pass" wrapClassName="es-pw" className="es-input" placeholder="App password" autoComplete="new-password" revealable={!!s.smtp_pass && s.smtp_pass !== SAVED_PASSWORD} value={s.smtp_pass || ''} onChange={set('smtp_pass')} />
                  </Field>
                  <Field id="from_name" label="Sender name">
                    <input id="es-from_name" className="es-input" placeholder="Sunny Studios" autoComplete="off" value={s.from_name || ''} onChange={set('from_name')} />
                  </Field>
                  <Field id="from_email" label="Sender email">
                    <input id="es-from_email" className="es-input" placeholder="info@yourstudio.com" autoComplete="off" value={s.from_email || ''} onChange={set('from_email')} />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="es-alerts">
        <Field id="notify_email" label="📬 New-lead alerts go to">
          <input id="es-notify_email" className="es-input" type="email" placeholder="you@email.com" value={s.notify_email || ''} onChange={set('notify_email')} />
        </Field>
      </div>

      <button type="button" className="refresh set-primary es-save" onClick={save}>💾 Save email settings</button>
    </div>
  );
}
