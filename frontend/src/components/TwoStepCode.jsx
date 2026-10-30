import { useRef, useState } from 'react';
import { api, rememberDevice } from '../lib/api';
import './twoStep.css';

/**
 * ✉️ Two-step sign-in (Raj, 2026-10-30, option B): after the right password on a device this account hasn't trusted,
 * a 6-digit code goes to the account's email (from noreply@iwopo.com). "Remember this device for 30 days" is on by
 * default, so a vendor is asked only on a new device or about once a month. A password change forgets every device.
 */
export default function TwoStepCode({ email, challenge, onDone, onBack }) {
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(challenge.sandbox_code || '');   // the test site has no real email — it shows the code
  const busy = useRef(false);   // one request at a time (phone keyboards repeat Enter)

  async function verify() {
    if (busy.current) return;
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from the email'); return; }
    busy.current = true; setLoading(true); setError('');
    try {
      const r = await api.loginCode(challenge.ticket, code, remember);
      if (r.device_token) rememberDevice(email, r.device_token);
      onDone(r.token, r.user);
    } catch (e) { setError(e.message); }
    finally { busy.current = false; setLoading(false); }
  }

  async function resend() {
    if (busy.current) return;
    busy.current = true; setError(''); setNotice('');
    try {
      const r = await api.loginResend(challenge.ticket);
      setNotice('A new code is on its way. 📬');
      if (r.sandbox_code) setHint(r.sandbox_code);
    } catch (e) { setError(e.message); }
    finally { busy.current = false; }
  }

  return (
    <>
      <h1>Check your email ✉️</h1>
      <p className="login-sub">We sent a 6-digit sign-in code to <b>{challenge.email}</b>.</p>
      <label>Sign-in code</label>
      <input className="ts-code" name="one-time-code" autoComplete="one-time-code" inputMode="numeric" placeholder="123456" autoFocus
        value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={e => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); verify(); } }} />
      {hint && <p className="ts-hint">🧪 Test site — no email is sent here. Your code is {hint}</p>}
      <label className="ts-remember">
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember this device for 30 days
      </label>
      {error && <div className="login-error">⚠️ {error}</div>}
      {notice && <div className="login-notice">✅ {notice}</div>}
      <button className="login-btn" onClick={verify} disabled={loading}>{loading ? 'Checking…' : 'Verify & sign in'}</button>
      <div className="login-forgot-row">
        <span className="login-forgot-link" onClick={resend}>Send a new code</span>
        <span className="ts-sep" aria-hidden="true">·</span>
        <span className="login-forgot-link" onClick={onBack}>← Back</span>
      </div>
    </>
  );
}
