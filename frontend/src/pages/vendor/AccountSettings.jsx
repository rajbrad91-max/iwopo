/**
 * Settings → Account (Raj, 2026-11-14): the business profile beside sign-in & security. Plain labels and the panel's
 * own buttons; every field one style. The server checks everything again — these screens only collect it.
 */
import { useState, useEffect } from 'react';
import { phoneChars } from '../../lib/phone';
import { api } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import PasswordInput from '../../components/PasswordInput';
import AutoRenewSetting from '../../components/AutoRenewSetting';

/** the same email rule the server applies when an address is changed */
const EMAIL_OK = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/** a short line under a section: { tone: 'ok' | 'bad' | 'busy', text } */
const Note = ({ msg }) => (msg ? <p className={`acct-msg is-${msg.tone}`} role={msg.tone === 'bad' ? 'alert' : 'status'}>{msg.text}</p> : null);

function BusinessProfile({ onProfileChange, onProfileSaved }) {
  const [prof, setProf] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.myProfile().then(d => setProf(d.profile || {})).catch(() => setProf({})); }, []);
  if (!prof) return <div className="table-wrap acct-card"><p className="acct-sub">Loading…</p></div>;
  const set = (k, v) => setProf(p => ({ ...p, [k]: v }));

  async function save() {
    setMsg({ tone: 'busy', text: 'Saving…' });
    try { await api.saveProfile(prof); await onProfileSaved?.(); setMsg({ tone: 'ok', text: 'Saved' }); }
    catch (e) { setMsg({ tone: 'bad', text: e.message }); }
  }
  async function onLogoPick(e) {
    const f = e.target.files[0]; if (!f) return;
    setMsg({ tone: 'busy', text: 'Uploading…' });
    try {
      const r = await api.uploadLogo(f);
      set('logo_path', r.logo_path);
      // the sidebar renders from the profile the panel loaded at startup, so it is told too
      onProfileChange?.(p => (p ? { ...p, logo_path: r.logo_path } : p));
      setMsg({ tone: 'ok', text: 'Logo updated. It shows on your portal, contracts, invoices and certificates.' });
    } catch (err) { setMsg({ tone: 'bad', text: err.message }); }
  }

  return (
    <div className="table-wrap acct-card">
      <h2 className="acct-h">Business profile</h2>
      <p className="acct-sub">How your business appears to clients.</p>

      <span className="acct-label">Logo</span>
      <div className="acct-logo">
        {prof.logo_path && <img src={`/api/me/logo/${prof.logo_path}`} alt="Your logo" />}
        <label className="refresh acct-upload">
          Upload logo
          <input type="file" accept="image/*" onChange={onLogoPick} />
        </label>
      </div>

      <label className="acct-label" htmlFor="acct-biz">Company name</label>
      <input id="acct-biz" className="acct-input" value={prof.business_name || ''} onChange={e => set('business_name', e.target.value)} />
      <label className="acct-label" htmlFor="acct-phone">Phone</label>
      <input id="acct-phone" className="acct-input" type="tel" inputMode="tel" value={prof.phone || ''} onChange={e => set('phone', phoneChars(e.target.value))} />
      <label className="acct-label" htmlFor="acct-bemail">Business email</label>
      <input id="acct-bemail" className="acct-input" type="email" value={prof.email || ''} onChange={e => set('email', e.target.value)} />
      <label className="acct-label" htmlFor="acct-country">Country</label>
      {/* A select, not a text box: typed countries arrive as "Canada", "canada" and "CA" and each becomes its own
          bucket. Same list the geo pricing uses, so where a seller is and what they pay agree. */}
      <select id="acct-country" className="acct-input" value={prof.country || ''} onChange={e => set('country', e.target.value)}>
        <option value="">Select your country</option>
        {COUNTRIES.filter(c => c.code !== 'default').map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>

      <div className="acct-actions">
        <button type="button" className="refresh" onClick={save}>Save profile</button>
        <Note msg={msg} />
      </div>
    </div>
  );
}

function SignInEmail({ user }) {
  const [em, setEm] = useState({ email: '', password: '' });
  const [code, setCode] = useState(null);   // { email, code, practice } — waiting for the code from the new address
  const [msg, setMsg] = useState(null);

  async function send() {
    if (!EMAIL_OK(em.email)) { setMsg({ tone: 'bad', text: 'That is not a valid email address.' }); return; }
    setMsg(null);
    try {
      const r = await api.changeEmail(em.email, em.password);
      setEm(v => ({ ...v, password: '' }));
      setCode({ email: r.email, practice: r.sandbox_code || '', code: '' });
      setMsg({ tone: 'ok', text: `We sent a 6-digit code to ${r.email}. Enter it below to finish the change.` });
    } catch (e) { setMsg({ tone: 'bad', text: e.message }); }
  }
  /* the code from the NEW address finishes the change */
  async function confirm() {
    setMsg(null);
    try {
      const r = await api.confirmEmailChange(code.code);
      setCode(null); setEm({ email: '', password: '' });
      setMsg({ tone: 'ok', text: `Email changed. You now sign in with ${r.email}.` });
    } catch (e) { setMsg({ tone: 'bad', text: e.message }); }
  }

  return (
    <div className="acct-sec">
      <p className="acct-sec-h">Sign-in email</p>
      {user?.email && <p className="acct-row-text">You sign in with <b>{user.email}</b></p>}
      <label className="acct-label" htmlFor="acct-newemail">New email</label>
      <input id="acct-newemail" className="acct-input" type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={em.email} onChange={e => setEm({ ...em, email: e.target.value })} placeholder="new@email.com" />
      {/* a heads-up while typing (Raj, 2026-10-23): an address without its @ was once saved and nobody could sign in */}
      {em.email.trim() && !EMAIL_OK(em.email) && <p className="acct-msg is-bad" role="alert">That doesn't look like a valid email address. It needs an @ and a domain, like name@example.com.</p>}
      {/* Confirming with the current password stops a hijacked session silently moving the account to an attacker's
          address. Masked with no reveal: you either know it or you don't. */}
      <label className="acct-label" htmlFor="acct-empw">Current password</label>
      <input id="acct-empw" className="acct-input" type="password" autoComplete="current-password"
        value={em.password} onChange={e => setEm({ ...em, password: e.target.value })} />
      <div className="acct-actions">
        <button type="button" className="refresh" onClick={send} disabled={!EMAIL_OK(em.email) || !em.password}>Update email</button>
      </div>
      {code && (
        <div className="acct-confirm">
          <label className="acct-label" htmlFor="acct-code">Code sent to {code.email}</label>
          <input id="acct-code" className="acct-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
            value={code.code} onChange={e => setCode({ ...code, code: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
          {code.practice && <p className="acct-row-text">Test site: emails aren't sent here. The code is <b>{code.practice}</b>.</p>}
          <div className="acct-actions">
            <button type="button" className="refresh" disabled={code.code.length !== 6} onClick={confirm}>Confirm new email</button>
          </div>
        </div>
      )}
      <Note msg={msg} />
    </div>
  );
}

function ChangePassword() {
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  async function save() {
    setMsg(null);
    try { await api.changePassword(pw.current, pw.next); setPw({ current: '', next: '' }); setMsg({ tone: 'ok', text: 'Password changed. Every other device was signed out.' }); }
    catch (e) { setMsg({ tone: 'bad', text: e.message }); }
  }
  return (
    <div className="acct-sec">
      <p className="acct-sec-h">Password</p>
      <label className="acct-label" htmlFor="acct-pwcur">Current password</label>
      <PasswordInput id="acct-pwcur" className="acct-input" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
      <label className="acct-label" htmlFor="acct-pwnew">New password</label>
      <PasswordInput id="acct-pwnew" className="acct-input" autoComplete="new-password" checklist value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} />
      <div className="acct-actions">
        <button type="button" className="refresh" onClick={save} disabled={!pw.current || !pw.next}>Change password</button>
      </div>
      <Note msg={msg} />
    </div>
  );
}

/**
 * Two-step sign-in, on or off for this account (Raj, 2026-11-14). The switch shows where it stands; changing it in
 * either direction asks for the password first. The server checks the password, logs the change to the account's
 * security log and emails the account holder (routes/me.js /two-step).
 */
function TwoStepSetting() {
  const [on, setOn] = useState(null);   // null while loading
  const [asking, setAsking] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.twoStep().then(d => setOn(!!d.enabled)).catch(() => setOn(null)); }, []);
  if (on === null) return null;
  const want = !on;

  function cancel() { setAsking(false); setPw(''); }
  async function confirm(e) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.setTwoStep(want, pw);
      setOn(r.enabled); cancel();
      setMsg({ tone: 'ok', text: r.enabled ? 'Two-step sign-in is on.' : 'Two-step sign-in is off.' });
    } catch (err) { setMsg({ tone: 'bad', text: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="acct-sec">
      <div className="acct-row">
        <div>
          <p className="acct-sec-h">Two-step sign-in</p>
          <p className="acct-row-text">{on
            ? 'On. Signing in on a new device also asks for a code we email you.'
            : 'Off. Your password alone signs you in. We recommend keeping this on.'}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label="Two-step sign-in" disabled={busy}
          className={`svx-switch${on ? ' is-on' : ''}`} onClick={() => { setMsg(null); setPw(''); setAsking(a => !a); }}>
          <span className="svx-switch-knob" />
        </button>
      </div>
      {asking && (
        <form className="acct-confirm" onSubmit={confirm}>
          <label className="acct-label" htmlFor="acct-tspw">Enter your password to turn two-step sign-in {want ? 'on' : 'off'}</label>
          <PasswordInput id="acct-tspw" className="acct-input" autoComplete="current-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} />
          <div className="acct-actions">
            <button type="submit" className="refresh" disabled={!pw || busy}>{busy ? 'Checking…' : `Turn ${want ? 'on' : 'off'}`}</button>
            <button type="button" className="refresh" onClick={cancel}>Cancel</button>
          </div>
        </form>
      )}
      <Note msg={msg} />
    </div>
  );
}

export function AccountSettings({ user, onProfileChange, onProfileSaved }) {
  return (
    <>
      <BusinessProfile onProfileChange={onProfileChange} onProfileSaved={onProfileSaved} />
      <div className="table-wrap acct-card">
        <h2 className="acct-h">Sign-in &amp; security</h2>
        <p className="acct-sub">How you sign in to iwopo.</p>
        <SignInEmail user={user} />
        <ChangePassword />
        <TwoStepSetting />
        <AutoRenewSetting />
      </div>
    </>
  );
}
