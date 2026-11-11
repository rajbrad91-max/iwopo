import { useState } from 'react';
import './passwordInput.css';
import { passwordChecklist } from '../lib/passwordRules';

/* 👁️ Raj's pick (2026-11-11): a thin line eye to show the password, a closed eye with lashes to hide it again */
const EyeOpen = () => (
  <svg className="pw-eye-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeClosed = () => (
  <svg className="pw-eye-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 10c2.5 3.5 6 5.5 10 5.5S19.5 13.5 22 10" /><path d="M5 13.3 3.4 15.6M9 15.1l-.7 2.7M15 15.1l.7 2.7M19 13.3l1.6 2.3" />
  </svg>
);

/**
 * Password field with a show/hide eye toggle.
 * Passes through any input props (value, onChange, placeholder, onKeyDown, className, style, autoFocus).
 * Use anywhere a masked password is typed - EXCEPT the super admin panel.
 * checklist: pass { email, name, business } (or true) on a NEW-password box to show the live rules under it.
 */
export default function PasswordInput({ className = '', style, wrapClassName = '', checklist, ...props }) {
  const [show, setShow] = useState(false);
  const rules = checklist && props.value ? passwordChecklist(props.value, checklist === true ? {} : checklist) : null;
  return (
    <>
    <div className={`pw-field ${wrapClassName}`} style={style}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`pw-field-input ${className}`}
      />
      <button
        type="button"
        className="pw-field-eye"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <EyeClosed /> : <EyeOpen />}
      </button>
    </div>
    {rules && (
      <ul className="pw-rules" aria-label="Password rules">
        {rules.map(r => <li key={r.label} className={r.ok ? 'is-ok' : ''}>{r.ok ? '✓' : '○'} {r.label}</li>)}
      </ul>
    )}
    </>
  );
}
