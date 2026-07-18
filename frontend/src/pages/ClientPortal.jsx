import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './inquiry.css';

export default function ClientPortal({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, [token]);
  function load() {
    api.portal(token).then(setData).catch(e => setErr(e.message));
  }

  async function pick(id) {
    setBusy(true); setMsg('');
    try { await api.portalPick(token, id); setMsg('✅ Package selected!'); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  async function officeVisit() {
    setBusy(true);
    try { await api.portalOfficeVisit(token); setMsg('🏢 Request sent — we\'ll contact you to arrange payment!'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  if (err) return <div className="iq-wrap"><div className="iq-card">⚠️ {err}</div></div>;
  if (!data) return <div className="iq-wrap"><div className="iq-card">Loading…</div></div>;

  const { lead, business_name, templates, packages, money } = data;
  const byTpl = (tid) => packages.filter(p => p.template_id === tid);

  return (
    <div className="iq-wrap">
      <div className="iq-card" style={{ maxWidth: 720 }}>
        <div className="iq-brand"><img src="/logo_icon.png" alt="" className="iq-brand-img" /> {business_name}</div>
        <p className="iq-sub">Hi {lead.name} 👋 — your {lead.event_type} {lead.event_date ? `on ${String(lead.event_date).slice(0, 10)}` : ''}</p>

        {msg && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, background: msg[0] === '⚠' ? '#fb718522' : '#4ade8022', color: msg[0] === '⚠' ? '#fb7185' : '#4ade80', fontSize: 13 }}>{msg}</div>}

        <h3 style={{ margin: '10px 0' }}>📦 Choose your package</h3>
        {templates.map(t => {
          const list = byTpl(t.id);
          if (!list.length) return null;
          return (
            <div key={t.id} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: '#7c9199', marginBottom: 8, fontWeight: 700 }}>✨ {t.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                {list.map(p => {
                  const selected = lead.package_id === p.id;
                  const inc = Array.isArray(p.inclusions) ? p.inclusions : [];
                  return (
                    <div key={p.id} onClick={() => !busy && pick(p.id)}
                      style={{ border: `2px solid ${selected ? '#2dd4bf' : '#223238'}`, borderRadius: 12, padding: 14, cursor: 'pointer', background: selected ? '#2dd4bf14' : '#0d1417' }}>
                      <div style={{ fontWeight: 800 }}>{selected ? '✅ ' : ''}{p.name}</div>
                      <div style={{ color: '#2dd4bf', fontWeight: 800, fontSize: 18, margin: '6px 0' }}>${Number(p.base_price).toFixed(0)}</div>
                      <div style={{ fontSize: 11.5, color: '#7c9199' }}>{p.included_hours}h included · ${Number(p.per_hour_price).toFixed(0)}/extra hr</div>
                      {inc.slice(0, 4).map((x, i) => <div key={i} style={{ fontSize: 11.5, marginTop: 4 }}>✓ {x}</div>)}
                      {inc.length > 4 && <div style={{ fontSize: 11, color: '#7c9199', marginTop: 3 }}>+{inc.length - 4} more…</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {lead.package_id && (
          <>
            <h3 style={{ margin: '14px 0 8px' }}>💰 Your balance</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ background: '#0d1417', border: '1px solid #223238', borderRadius: 8, padding: '8px 12px' }}>💵 Total: <b>${money.final_total}</b></span>
              <span style={{ background: '#0d1417', border: '1px solid #223238', borderRadius: 8, padding: '8px 12px' }}>🔐 Deposit: <b>${money.deposit_amount}</b></span>
              <span style={{ background: '#4ade8018', border: '1px solid #4ade8044', borderRadius: 8, padding: '8px 12px', color: '#4ade80' }}>✅ Paid: <b>${money.paid}</b></span>
              <span style={{ background: '#fbbf2418', border: '1px solid #fbbf2444', borderRadius: 8, padding: '8px 12px', color: '#fbbf24' }}>⏳ Due: <b>${money.balance}</b></span>
            </div>
            <button className="iq-btn" onClick={officeVisit} disabled={busy} style={{ marginTop: 16 }}>
              🏢 Arrange payment with us
            </button>
            <p style={{ fontSize: 11, color: '#7c9199', textAlign: 'center', marginTop: 8 }}>
              We'll reach out to arrange e-transfer or in-person payment 💳
            </p>
          </>
        )}
      </div>
    </div>
  );
}
