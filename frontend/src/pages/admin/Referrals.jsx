/**
 * 🎁 Referrals and coupons.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';
import { StatCard } from './common';

/* ---------- REFERRALS ---------- */
function CouponBuilder() {
  const dialog = useDialog();
  const [coupons, setCoupons] = useState([]);
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [f, setF] = useState({ code: '', percent_off: '', applies_to: 'all', ends_at: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  function load() {
    api.offers().then(d => setCoupons(d.offers || [])).catch(() => {});
    api.adminServices().then(d => setServices(d.services || [])).catch(() => {});
    api.adminPackages().then(d => setPackages((d.packages || []).filter(p => p.price_monthly != null))).catch(() => {});
  }

  async function create() {
    if (!f.code || !f.percent_off) return setMsg('⚠️ Code + % required');
    try {
      await api.createOffer({ ...f, percent_off: Number(f.percent_off) });
      setF({ code: '', percent_off: '', applies_to: 'all', ends_at: '' });
      setMsg('✅ Coupon created'); setTimeout(() => setMsg(''), 1500); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
  }

  function targetLabel(a) {
    if (!a || a === 'all') return 'All services & packages';
    const [t, id] = a.split(':');
    if (t === 'service') return '🧩 ' + (services.find(s => s.id == id)?.name || 'service');
    if (t === 'package') return '📦 ' + (packages.find(p => p.id == id)?.name || 'package');
    return a;
  }


  return (
    <>
      <div className="sa-section-title u-margin-bottom-8px">Coupons 🎟️</div>
      <div className="sa-box u-margin-bottom-12px">
        <div className="u-display-flex u-gap-8px u-flex-wrap-wrap u-align-items-center">
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-150px" placeholder="CODE (SUMMER20)" value={f.code}
            onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-90px" type="number" placeholder="% off" value={f.percent_off}
            onChange={e => setF({ ...f, percent_off: e.target.value })} />
          <select className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-min-width-200px" value={f.applies_to}
            onChange={e => setF({ ...f, applies_to: e.target.value })}>
            <option value="all">All services & packages</option>
            <optgroup label="Packages">
              {packages.map(p => <option key={'p' + p.id} value={`package:${p.id}`}>📦 {p.name}</option>)}
            </optgroup>
            <optgroup label="Services">
              {services.map(s => <option key={'s' + s.id} value={`service:${s.id}`}>🧩 {s.name}</option>)}
            </optgroup>
          </select>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-150px" type="date" value={f.ends_at}
            onChange={e => setF({ ...f, ends_at: e.target.value })} title="Expiry (optional)" />
          <button className="sa-btn-teal" onClick={create}>+ Create coupon</button>
          {msg && <span style={{ fontSize: 13, color: msg[0] === '✅' ? 'var(--green)' : 'var(--red)' }}>{msg}</span>}
        </div>
      </div>

      {coupons.length > 0 && (
        <div className="sa-table-wrap u-margin-bottom-20px">
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Applies to</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id}>
                  <td className="biz">🎟️ {c.code}</td>
                  <td>{c.percent_off}% off</td>
                  <td>{targetLabel(c.applies_to)}</td>
                  <td>{c.ends_at ? String(c.ends_at).slice(0, 10) : '—'}</td>
                  <td><span className={`sa-badge ${c.active ? 'active' : 'trial'}`}>{c.active ? 'active' : 'off'}</span></td>
                  <td className="u-display-flex u-gap-10px">
                    <span className="u-cursor-pointer" onClick={async () => { await api.toggleOffer(c.id); load(); }}>{c.active ? '🟢' : '⚪'}</span>
                    <span className="u-cursor-pointer" onClick={async () => { if (await dialog.confirm('This coupon will be deleted.', { title: 'Delete coupon?', okLabel: 'Delete' })) { await api.deleteOffer(c.id); load(); } }}>🗑️</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ReferralsView() {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { const d = await api.referrals(); setRefs(d.referrals || []); } catch {}
    finally { setLoading(false); }
  }
  const rewarded = refs.filter(r => r.status === 'rewarded').length;
  return (
    <>
      <CouponBuilder />
      <div className="sa-section-title u-margin-bottom-8px">Referrals 👥</div>
      <div className="sa-stats">
        <StatCard label="Total Referrals" value={refs.length} trend="Email-based" cls="up" />
        <StatCard label="Rewarded" value={rewarded} trend="🎁 free month each" cls="up" />
        <StatCard label="Pending" value={refs.length - rewarded} trend="Awaiting paid signup" cls="warn" />
      </div>
      <div className="sa-hint u-margin-bottom-12px">
        🎁 Reward = 1 free month for BOTH — applied when the friend signs up on a <b>paid</b> plan.
      </div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Referrer</th><th>Friend</th><th>Reward</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="sa-empty">Loading…</td></tr>
            ) : refs.length === 0 ? (
              <tr><td colSpan="4" className="sa-empty">No referrals yet.</td></tr>
            ) : refs.map(r => (
              <tr key={r.id}>
                <td className="biz">{r.referrer_email}</td>
                <td>{r.friend_email}</td>
                <td>{r.reward}</td>
                <td><span className={`sa-badge ${r.status === 'rewarded' ? 'active' : 'trial'}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
