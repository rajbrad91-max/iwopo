import { useState } from 'react';
import './passwordInput.css';
import { passwordChecklist } from '../lib/passwordRules';

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
        {show ? '\u{1F648}' : '\u{1F441}\u{FE0F}'}
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
