/**
 * 🎁 Refer a Friend.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

export function ReferForm() {
  /* 🎟️ Their code and link to share, an email invite, and the friends who joined (lib/referrals.js) */
  const [mine, setMine] = useState(null);
  const [friend, setFriend] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const load = () => api.myReferrals().then(setMine).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1600); } catch { setErr('Copy did not work — select it and copy by hand.'); }
  }
  async function send() {
    setMsg(''); setErr('');
    if (!friend) return setErr('Enter your friend\'s email');
    setBusy(true);
    try {
      await api.createReferral(friend);
      setMsg(`✅ Saved. When ${friend} signs up with this email and pays for a plan, you both get a free month.`);
      setFriend(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  const label = { pending: 'invited', joined: 'joined', owed: 'paid — your month is waiting', rewarded: 'paid — you got your month' };

  return (
    <div className="table-wrap rf">
      <h2 className="rf-h">👥 Refer a friend, both get a free month 🎁</h2>
      <p className="sub rf-sub">When a friend signs up with your code and pays for a plan, they get their <b>first month free</b> and you get <b>one month free</b>.</p>
      {mine && (
        <div className="rf-code">
          <div className="rf-row"><span className="rf-k">Your code</span><b className="rf-v">{mine.code}</b>
            <button type="button" className="refresh" onClick={() => copy(mine.code, 'code')}>{copied === 'code' ? '✓ Copied' : 'Copy'}</button></div>
          <div className="rf-row"><span className="rf-k">Your link</span><span className="rf-v rf-link">{mine.link}</span>
            <button type="button" className="refresh" onClick={() => copy(mine.link, 'link')}>{copied === 'link' ? '✓ Copied' : 'Copy'}</button></div>
        </div>
      )}
      <label className="rf-label" htmlFor="rf-email">Or invite them by email</label>
      <input id="rf-email" className="rf-input" value={friend} onChange={e => setFriend(e.target.value)} placeholder="friend@email.com" />
      {err && <div className="err-banner">⚠️ {err}</div>}
      {msg && <div className="rf-ok">{msg}</div>}
      <button className="refresh rf-send" onClick={send} disabled={busy}>{busy ? 'Saving…' : '📨 Save invite'}</button>
      {mine?.referrals?.length > 0 && (
        <ul className="rf-list">
          {mine.referrals.map((r, i) => <li key={i}><span>{r.friend_email}</span><span className="rf-state">{label[r.status] || r.status}</span></li>)}
        </ul>
      )}
    </div>
  );
}
