/**
 * 🎁 Referrals and coupons.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';
import { StatCard, Switch, DeleteButton } from './common';

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
    if (t === 'service') return services.find(s => s.id == id)?.name || 'service';
    if (t === 'package') return packages.find(p => p.id == id)?.name || 'package';
    return a;
  }


  return (
    <>
      <div className="sa-section-title u-margin-bottom-8px">Coupons</div>
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
              {packages.map(p => <option key={'p' + p.id} value={`package:${p.id}`}>{p.name}</option>)}
            </optgroup>
            <optgroup label="Services">
              {services.map(s => <option key={'s' + s.id} value={`service:${s.id}`}>{s.name}</option>)}
            </optgroup>
          </select>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-150px" type="date" value={f.ends_at}
            onChange={e => setF({ ...f, ends_at: e.target.value })} title="Expiry (optional)" />
          <button className="sa-btn" onClick={create}>+ Create coupon</button>
          {msg && <span className={`sa-note ${msg[0] === '✅' ? 'is-ok' : ''}`}>{msg}</span>}
        </div>
      </div>

      {coupons.length > 0 && (
        <div className="sa-table-wrap u-margin-bottom-20px">
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Applies to</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id}>
                  <td className="biz">{c.code}</td>
                  <td>{c.percent_off}% off</td>
                  <td>{targetLabel(c.applies_to)}</td>
                  <td>{c.ends_at ? String(c.ends_at).slice(0, 10) : '—'}</td>
                  <td><span className={`sa-badge ${c.active ? 'active' : 'trial'}`}>{c.active ? 'active' : 'off'}</span></td>
                  <td className="u-display-flex u-gap-10px">
                    <Switch on={c.active} onChange={async () => { await api.toggleOffer(c.id); load(); }} label={c.active ? 'Turn off' : 'Turn on'} />
                    <DeleteButton onClick={async () => { if (await dialog.confirm('This coupon will be deleted.', { title: 'Delete coupon?', okLabel: 'Delete' })) { await api.deleteOffer(c.id); load(); } }} />
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

/** 🏆 Who brought how many (Raj, 2026-11-16): every referrer, the sign-ups that came with their code or invite, how many of
 *  those pay, and invites still waiting — most sign-ups first. "View friends" narrows the list below to theirs. */
function TopReferrers({ board, only, onOnly }) {
  return (
    <>
      <div className="sa-section-title sa-ref-title">Top referrers</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Referrer</th><th>Code</th><th>Signed up</th><th>Paying</th><th>Waiting</th><th /></tr></thead>
          <tbody>
            {board.length === 0 ? <tr><td colSpan="6" className="sa-empty">No referrals yet.</td></tr> : board.map(b => (
              <tr key={b.email}>
                <td><div className="biz">{b.business_name || b.email}</div>{b.business_name && <div className="sa-ref-email">{b.email}</div>}</td>
                <td>{b.code || '—'}</td>
                <td className="biz">{b.signed_up}</td>
                <td>{b.paying}</td>
                <td>{b.waiting}</td>
                <td><button type="button" className={`sa-view-btn ${only === b.email ? 'active-btn' : ''}`} onClick={() => onOnly(only === b.email ? null : b.email)}>
                  {only === b.email ? 'Show everyone' : 'View friends'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ReferralsView() {
  const [refs, setRefs] = useState([]);
  const [board, setBoard] = useState([]);
  const [only, setOnly] = useState(null);   // one referrer's friends, or everyone's
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { const d = await api.referrals(); setRefs(d.referrals || []); setBoard(d.board?.referrers || []); } catch {}
    finally { setLoading(false); }
  }
  const sum = (k) => board.reduce((n, b) => n + b[k], 0);
  const shown = only ? refs.filter(r => r.referrer_email.toLowerCase() === only) : refs;
  return (
    <>
      <CouponBuilder />
      <div className="sa-section-title u-margin-bottom-8px">Referrals</div>
      <div className="sa-stats">
        <StatCard label="Signed up" value={sum('signed_up')} trend="With a code or an invite" cls="up" />
        <StatCard label="Paying" value={sum('paying')} trend="1 free month each" cls="up" />
        <StatCard label="Waiting" value={sum('waiting')} trend="Invited, not signed up" cls="warn" />
      </div>
      <div className="sa-hint u-margin-bottom-12px">
        Reward = 1 free month for BOTH — applied when the friend signs up on a <b>paid</b> plan.
      </div>
      {!loading && <TopReferrers board={board} only={only} onOnly={setOnly} />}
      <div className="sa-section-title sa-ref-title">{only ? `Friends of ${only}` : 'Every referral'}</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Referrer</th><th>Friend</th><th>Reward</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="sa-empty">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan="4" className="sa-empty">No referrals yet.</td></tr>
            ) : shown.map(r => (
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
