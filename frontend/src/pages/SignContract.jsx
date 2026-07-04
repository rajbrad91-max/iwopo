import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './inquiry.css';

export default function SignContract({ token }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.viewContract(token).then(d => setC(d.contract)).catch(e => setErr(e.message));
  }, [token]);

  async function sign() {
    if (!name.trim()) return setErr('Type your full name to sign');
    setBusy(true); setErr('');
    try { await api.signContract(token, name); setDone(true); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !c) return <div className="iq-wrap"><div className="iq-card">⚠️ {err}</div></div>;
  if (!c) return <div className="iq-wrap"><div className="iq-card">Loading…</div></div>;

  if (done || c.status === 'signed') return (
    <div className="iq-wrap">
      <div className="iq-card iq-done">
        <div className="iq-check">✓</div>
        <h2>Contract signed! ✅</h2>
        <p>{c.signed_name ? `Signed by ${c.signed_name}` : `Thank you, ${name}!`}</p>
      </div>
    </div>
  );

  return (
    <div className="iq-wrap">
      <div className="iq-card" style={{ maxWidth: 640 }}>
        <div className="iq-brand">📄 {c.title}</div>
        <p className="iq-sub">{c.business_name} · for {c.client_name}</p>

        <div style={{ background: '#0d1417', border: '1px solid #223238', borderRadius: 10, padding: 16, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, maxHeight: 380, overflowY: 'auto' }}>
          {c.body}
        </div>

        <label style={{ marginTop: 16 }}>✍️ Type your full legal name to sign</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />

        {err && <div className="iq-err">⚠️ {err}</div>}
        <button className="iq-btn" onClick={sign} disabled={busy}>
          {busy ? 'Signing…' : '✍️ Sign Contract'}
        </button>
        <p style={{ fontSize: 11, color: '#7c9199', marginTop: 10, textAlign: 'center' }}>
          By signing you agree to the terms above. Your name, IP & timestamp are recorded. 🔐
        </p>
      </div>
    </div>
  );
}
