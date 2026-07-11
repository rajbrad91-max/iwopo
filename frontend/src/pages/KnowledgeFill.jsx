import { useState, useEffect } from 'react';
import './knowledge.css';

const API = '/api/chatbot';

const KFIELDS = [
  { k: 'business_name', label: '🏢 Business name', type: 'input', ph: 'e.g. Perfect Poses Media' },
  { k: 'tagline', label: '✨ Tagline', type: 'input', ph: 'One line about what you do' },
  { k: 'service_area', label: '📍 City / service area', type: 'input', ph: 'e.g. Surrey, Abbotsford, Greater Vancouver' },
  { k: 'contact', label: '📞 Contact (phone / email)', type: 'input', ph: 'How clients reach you' },
  { k: 'hours', label: '🕒 Hours', type: 'input', ph: 'e.g. Mon–Sat 9am–7pm' },
  { k: 'services', label: '📸 Services offered', type: 'area', ph: 'Photography, videography, drone, photo booth…' },
  { k: 'packages', label: '💰 Packages & pricing', type: 'area', ph: 'Package names, what’s included, prices' },
  { k: 'faqs', label: '❓ FAQs', type: 'area', ph: 'Q: How far do you travel?\nA: Anywhere in BC, travel fee after 50km.' },
  { k: 'policies', label: '📋 Policies', type: 'area', ph: 'Booking, deposit, travel fees, cancellation, rescheduling' },
  { k: 'notes', label: '📝 Anything else', type: 'area', ph: 'Anything else the chatbot should know' },
];

export default function KnowledgeFill({ token }) {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [k, setK] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}/fill/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || 'Not found'))))
      .then(setMeta)
      .catch(e => setErr(e.message));
  }, [token]);

  async function unlock(e) {
    e?.preventDefault();
    setCodeErr('');
    try {
      const r = await fetch(`${API}/fill/${token}/unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Wrong access code');
      setK(d.knowledge);
    } catch (e) { setCodeErr(e.message); }
  }

  async function submit(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`${API}/fill/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...k, code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { alert('⚠️ ' + e.message); }
    finally { setSaving(false); }
  }

  if (err) return <div className="kf-wrap"><div className="kf-msg">⚠️ {err}</div></div>;
  if (!meta) return <div className="kf-wrap"><div className="kf-msg">Loading…</div></div>;

  // 🔒 access code gate
  if (!k) {
    return (
      <div className="kf-wrap">
        <div className="kf-gate">
          <div className="kf-kicker">Chatbot setup</div>
          <h1 className="kf-title">{meta.business_name}</h1>
          <div className="kf-sub">Enter your access code to fill in your details.</div>
          <form onSubmit={unlock} className="kf-gate-form">
            <input className="kf-input" type="password" placeholder="Access code" value={code} onChange={e => setCode(e.target.value)} autoFocus />
            <button className="kf-btn" type="submit">🔓 Continue</button>
          </form>
          {codeErr && <div className="kf-err">⚠️ {codeErr}</div>}
        </div>
      </div>
    );
  }

  // 📝 fill-in form
  return (
    <div className="kf-wrap">
      <div className="kf-card">
        <div className="kf-kicker">Chatbot setup</div>
        <h1 className="kf-title">{meta.business_name}</h1>
        <div className="kf-sub">Fill this in so your chatbot can answer clients accurately. You can come back and update it anytime.</div>

        <form onSubmit={submit}>
          {KFIELDS.map(f => (
            <div key={f.k} className="kf-field">
              <label className="kf-label">{f.label}</label>
              {f.type === 'input'
                ? <input className="kf-input" placeholder={f.ph} value={k[f.k] || ''} onChange={e => setK({ ...k, [f.k]: e.target.value })} />
                : <textarea className="kf-input kf-area" placeholder={f.ph} value={k[f.k] || ''} onChange={e => setK({ ...k, [f.k]: e.target.value })} />}
            </div>
          ))}
          <button className="kf-btn kf-submit" type="submit" disabled={saving}>
            {saving ? 'Saving…' : saved ? '✅ Saved!' : '💾 Save my details'}
          </button>
        </form>
      </div>
      <div className="kf-foot">Powered by iwopo</div>
    </div>
  );
}
