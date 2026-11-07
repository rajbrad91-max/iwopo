import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';

/**
 * ✉️ "Enter the 6-digit code we emailed you" — used by sign-up and by sign-in when an address isn't confirmed yet.
 * On staging the code is shown on screen (nothing is emailed there).
 */
export default function VerifyCode({ email, sandboxCode, notSent, onVerified, onBack, onAlreadyConfirmed, ticket, initialCode = '' }) {
  const [code, setCode] = useState(initialCode);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(45);
  const [practice, setPractice] = useState(sandboxCode || '');
  const [confirmed, setConfirmed] = useState(false);   // already confirmed (the email's button, say): say so and carry on
  // opened from the email's button: the code is already here — check it once, straight away
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !/^\d{6}$/.test(initialCode)) return;
    tried.current = true;
    api.verifyEmail(email, initialCode).then(onVerified).catch(e => (e.code === 'already_confirmed' ? setConfirmed(true) : setErr(e.message)));
  }, [initialCode, email, onVerified]);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function verify() {
    setErr(''); setBusy(true);
    try { onVerified(await api.verifyEmail(email, code)); }
    catch (e) { if (e.code === 'already_confirmed') setConfirmed(true); else setErr(e.message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setErr(''); setInfo('');
    try {
      const r = await api.resendCode(email, ticket);
      if (r.already_confirmed) { setConfirmed(true); return; }
      if (r.sandbox_code) setPractice(r.sandbox_code); setInfo(r.message || 'A new code is on its way. 📬'); setWait(45);
    }
    catch (e) { setErr(e.message); }
  }

  if (confirmed) {
    return (
      <div className="vc">
        <h1>Email confirmed ✅</h1>
        <p className="login-sub"><b>{email}</b> is already confirmed. Log in to carry on — if you chose a plan, payment is the next step.</p>
        {onAlreadyConfirmed
          ? <button className="login-btn" onClick={onAlreadyConfirmed}>Log in</button>
          : <button className="login-btn" onClick={() => window.location.assign('/')}>Go to log in</button>}
      </div>
    );
  }

  return (
    <div className="vc">
      <h1>Check your email ✉️</h1>
      <p className="login-sub">We sent a 6-digit code to <b>{email}</b>. Enter it to confirm your address.</p>
      {practice && <p className="vc-practice">🧪 Test site: emails aren't sent here. Your code is <b>{practice}</b>.</p>}
      {notSent && !practice && <p className="vc-warn">⚠️ The code couldn't be emailed right now. Try "Send a new code" in a minute.</p>}
      <label htmlFor="vc-code">Code</label>
      <input id="vc-code" className="vc-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" autoFocus
        value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={e => e.key === 'Enter' && code.length === 6 && verify()} />
      {err && <div className="login-error" role="alert">{err}</div>}
      {info && <div className="login-notice">{info}</div>}
      <button className="login-btn" disabled={busy || code.length !== 6} onClick={verify}>{busy ? 'Checking…' : 'Confirm email'}</button>
      <div className="vc-row">
        <button type="button" className="vc-link" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Send a new code (${wait}s)` : 'Send a new code'}</button>
        {onBack && <button type="button" className="vc-link" onClick={onBack}>← Use a different email</button>}
      </div>
    </div>
  );
}
