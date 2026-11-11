/**
 * 👥 Buyers: every seller, their plan, storage and features (the seller drawer).
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';
import DeleteVendorModal from '../../components/DeleteVendor';
import { StatCard } from './common';

function FeatureToggles({ vendorId }) {
  const dialog = useDialog();
  const [feats, setFeats] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    api.vendorFeatures(vendorId).then(d => setFeats(d.features || [])).catch(() => setFeats([]));
  }, [vendorId]);

  async function toggle(f) {
    setBusy(f.key);
    try {
      await api.setVendorFeature(vendorId, f.key, { enabled: !f.enabled });
      const d = await api.vendorFeatures(vendorId);
      setFeats(d.features || []);
    } catch (e) {
      /* This swallowed the answer. The server refuses to switch on a feature
         marked as not built and says exactly that — File Flyer was flagged
         is_live=false long after it shipped, so the toggle did nothing and
         explained nothing, and the time went on wondering whether the button
         was broken. */
      dialog.alert(e.message, { title: 'Could not change that', error: true });
    }
    setBusy('');
  }

  if (!feats) return <div className="u-font-size-13px u-color-muted u-padding-6px-0">Loading…</div>;
  return (
    <div>
      {feats.map(f => (
        <div key={f.key} className="sa-feat-row">
          <span className="sa-feat-name">{f.label}{f.overridden && <span className="sa-feat-ovr" title="Manually overridden — not following the plan default">override</span>}</span>
          <button
            className={`sa-feat-toggle ${f.enabled ? 'is-on' : ''}`}
            onClick={() => toggle(f)}
            disabled={busy === f.key}
            aria-label={`${f.enabled ? 'Disable' : 'Enable'} ${f.label}`}
          >
            <span className="sa-feat-knob" />
          </button>
        </div>
      ))}
    </div>
  );
}

function VendorDrawer({ vendorId, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  /* Named so the plan picker can call it: changing a plan changes the storage
     figures beside it, and a drawer still showing the old allowance is how
     somebody sets the same thing twice. */
  const load = useCallback(() => {
    api.vendorDetail(vendorId).then(setD).catch(e => setErr(e.message));
  }, [vendorId]);
  useEffect(() => { load(); }, [load]);

  const fmt = (x) => x ? String(x).slice(0, 10) : '—';
  const row = (k, v) => (
    <div className="u-display-flex u-justify-content-space-between u-padding-8px-0 u-border-bottom-1px-solid-line u-font-size-13_5px">
      <span className="u-color-muted">{k}</span><span className="u-font-weight-600 u-text-align-right">{v ?? '—'}</span>
    </div>
  );

  return (
    <>
      <div className="u-position-fixed u-inset-0 u-background-rgba-000_5 u-z-index-60" onClick={onClose} />
      <div className="u-position-fixed u-top-0 u-right-0 u-height-100vh u-width-440px u-max-width-92vw u-background-panel u-border-left-1px-solid-line u-z-index-61 u-padding-24px u-overflow-y-auto">
        <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-bottom-16px">
          <h2 className="u-margin-0">Vendor details</h2>
          <span className="u-cursor-pointer u-font-size-20px" onClick={onClose}>✕</span>
        </div>
        {err && <div className="sa-empty">⚠️ {err}</div>}
        {!d && !err && <div className="sa-loading">Loading…</div>}
        {d && (
          <>
            <div className="u-font-size-18px u-font-weight-700 u-margin-bottom-4px">{d.vendor.business_name}</div>
            <div className="u-margin-bottom-16px"><span className={`sa-badge ${d.vendor.status}`}>{d.vendor.status}</span></div>

            <div className="sa-section-title u-font-size-12px u-margin-6px-0">Account</div>
            {/* from the subscription, not the old vendors.plan column */}
            {row('Plan', d.storage?.limit_source === 'plan' ? d.storage.plan_name : 'Free trial')}
            {row('Country', d.vendor.country)}
            {row('🌍 Signup IP', d.vendor.signup_ip)}
            {row('Storage', d.vendor.storage_mb ? `${d.vendor.storage_mb} MB` : '—')}
            {row('Joined', fmt(d.vendor.created_at))}

            <div className="sa-section-title u-font-size-12px u-margin-16px-0-6px">Contact</div>
            {d.users.map(u => (
              <div key={u.id}>
                {row('👤 Name', u.name)}
                {row('📧 Email', u.email)}
                {row('Role', u.role)}
              </div>
            ))}

            <div className="sa-section-title u-font-size-12px u-margin-16px-0-6px">Referred by</div>
            {d.referredBy
              ? row('🎁 ' + d.referredBy.referrer_email, d.referredBy.status)
              : <div className="u-font-size-13px u-color-muted u-padding-6px-0">Not referred</div>}

            <div className="sa-section-title u-font-size-12px u-margin-16px-0-6px">Services subscribed</div>
            {d.services.length === 0
              ? <div className="u-font-size-13px u-color-muted u-padding-6px-0">No services yet</div>
              : d.services.map(s => (
                <div className="u-display-flex u-justify-content-space-between u-padding-6px-0 u-border-bottom-1px-solid-line u-font-size-13_5px" key={s.id}>
                  <span>{s.icon} {s.name}</span>
                  <span style={{ color: s.enabled ? 'var(--green,#4ade80)' : 'var(--muted)' }}>{s.enabled ? '✅ active' : 'off'} · ${s.price}</span>
                </div>
              ))}

            <div className="sa-section-title u-font-size-12px u-margin-16px-0-6px">Feature access</div>
            <FeatureToggles vendorId={vendorId} />

            <div className="sa-section-title u-font-size-12px u-margin-16px-0-6px">File Flyer storage</div>
            <PlanPicker vendorId={vendorId} storage={d.storage} onChanged={load} />
            <StorageLimit vendorId={vendorId} storage={d.storage} onSaved={load} />

            <Membership vendorId={vendorId} membership={d.membership} onChanged={load} />
            <div className="sa-section-title u-font-size-12px u-margin-16px-0-6px">Subscription history</div>
            {d.subscriptions.length === 0
              ? <div className="u-font-size-13px u-color-muted u-padding-6px-0">No subscription records</div>
              : d.subscriptions.map(su => (
                <div className="u-display-flex u-justify-content-space-between u-padding-6px-0 u-border-bottom-1px-solid-line u-font-size-13px" key={su.id}>
                  <span>{su.plan_name || 'Plan'} · <span className="u-color-muted">{su.status}</span></span>
                  <span className="u-color-muted">{fmt(su.started_at)}{su.ends_at ? ` → ${fmt(su.ends_at)}` : ''}</span>
                </div>
              ))}
          </>
        )}
      </div>
    </>
  );
}

/**
 * ⏸️ Membership (Raj, 2026-11-07): stop at the end of the paid period, stop now (no refund) or resume — the account,
 * its data and contact stay, so they can come back. Deleting the account is the separate 🗑️ in Buyers.
 */
function Membership({ vendorId, membership: m, onChanged }) {
  const [busy, setBusy] = useState('');
  const [sure, setSure] = useState(false);   // "stop now" asks twice
  const [msg, setMsg] = useState('');
  if (!m) return null;
  const day = (x) => (x ? new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  async function go(when) {
    setBusy(when); setMsg('');
    try { await api.vendorMembership(vendorId, when); setSure(false); onChanged(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(''); }
  }
  return (
    <div className="sa-mem">
      <div className="sa-mem-title">⏸️ Membership</div>
      {!m.paying ? <div className="sa-mem-line">Not paying right now — nothing to stop.</div> : (
        <>
          <div className="sa-mem-line">
            <b>{m.plan}</b> · {m.cycle || 'monthly'} · {m.stopping ? <span className="sa-mem-warn">stops {day(m.period_end)}</span> : <>renews {day(m.period_end)}</>}
          </div>
          <div className="sa-mem-actions">
            {m.stopping
              ? <button type="button" className="sa-view-btn" disabled={!!busy} onClick={() => go('resume')}>{busy === 'resume' ? 'Resuming…' : '▶️ Resume membership'}</button>
              : <button type="button" className="sa-view-btn" disabled={!!busy} onClick={() => go('period_end')}>{busy === 'period_end' ? 'Stopping…' : '⏸️ Stop at period end'}</button>}
            {!sure
              ? <button type="button" className="sa-mem-now" disabled={!!busy} onClick={() => setSure(true)}>⏹️ Stop now</button>
              : <button type="button" className="sa-mem-now is-sure" disabled={!!busy} onClick={() => go('now')}>{busy === 'now' ? 'Stopping…' : 'Confirm: stop today, no refund'}</button>}
          </div>
        </>
      )}
      <div className="sa-mem-line sa-mem-muted">📜 Terms: {m.terms_accepted_at ? `agreed ${day(m.terms_accepted_at)} (version ${m.terms_version})` : 'no record (signed up before the tick box)'}</div>
      <div className="sa-mem-line sa-mem-muted">📬 Offers: {m.marketing_opt_in ? `agreed ${day(m.marketing_opt_in_at)}` : 'not agreed'}</div>
      {msg && <div className="sa-mem-line">{msg}</div>}
    </div>
  );
}

/** 👋 Everyone who paid and stopped (or is stopping): who a win-back offer could go to. Export takes only those who agreed. */
function FormerSubscribers() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.formerSubscribers().then(d => setRows(d.former || [])).catch(() => setRows([])); }, []);
  const day = (x) => (x ? String(x).slice(0, 10) : '—');
  function exportAgreed() {
    const ok = (rows || []).filter(r => r.offers && r.email);
    const csv = ['business,name,email,last_plan,state,ended'].concat(ok.map(r => [r.business_name, r.name, r.email, r.plan, r.state, day(r.ended_at)].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `iwopo-former-subscribers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }
  const agreed = (rows || []).filter(r => r.offers).length;
  return (
    <>
      <div className="sa-section-title sa-former-title">👋 Former subscribers
        <button type="button" className="sa-view-btn" disabled={!agreed} onClick={exportAgreed}>⬇️ Export the {agreed} who agreed to offers</button>
      </div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Buyer</th><th>Last plan</th><th>State</th><th>Ended</th><th>Offers</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={5}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5}>Nobody has stopped paying yet.</td></tr>
              : rows.map(r => (
                <tr key={r.vendor_id}>
                  <td><b>{r.business_name}</b><div className="sa-former-mail">{r.email}</div></td>
                  <td>{r.plan || '—'}</td>
                  <td>{r.state === 'stopping' ? '⏸️ stopping' : '⏹️ ended'}</td>
                  <td>{day(r.ended_at)}</td>
                  <td>{r.offers ? '📬 agreed' : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * 🎫 Which plan this vendor is on — and therefore what they are allowed.
 *
 * Nothing in the app created a subscription before this, so a vendor who paid
 * stayed on the trial allowance until somebody set a per-vendor override by
 * hand. The plan is the answer; the override below is for the exceptions.
 */
function PlanPicker({ vendorId, storage, onChanged }) {
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.plansList().then(d => setPlans(d.plans || [])).catch(() => {}); }, []);

  const onPlan = storage?.limit_source === 'plan';
  const current = onPlan ? plans.find(p => p.name === storage.plan_name)?.id ?? '' : '';

  async function pick(v) {
    setBusy(true); setMsg('');
    try {
      await api.setVendorPlan(vendorId, v === '' ? null : Number(v));
      setMsg('✅ Saved');
      onChanged?.();
      setTimeout(() => setMsg(''), 1800);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="u-padding-6px-0-14px">
      <div className="u-font-size-13px u-color-muted u-margin-bottom-6px">
        Plan {storage?.limit_source === 'override'
          ? <span>— <b className="u-color-text">an override is in force</b>, so the plan is not deciding the limit</span>
          : null}
      </div>
      <div className="u-display-flex u-gap-8px u-align-items-center">
        <select value={current} disabled={busy} onChange={e => pick(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
                   background: 'var(--panel)', color: 'var(--text)', fontSize: 13 }}>
          <option value="">Free trial</option>
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.storage_gb ? p.storage_gb + ' GB' : 'no storage set'}
            </option>
          ))}
        </select>
        {msg && <span className="u-font-size-12_5px u-color-muted">{msg}</span>}
      </div>
    </div>
  );
}

/**
 * 💾 One vendor's File Flyer allowance.
 *
 * Per-vendor on purpose rather than a plan feature — the allowance is a
 * commercial decision about a particular vendor, and hanging it off a plan
 * would mean changing everyone on that plan to change one of them.
 */
function StorageLimit({ vendorId, storage, onSaved }) {
  const [mb, setMb] = useState(storage?.limit_mb ?? 1024);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  /* useState only reads its argument once, so changing the plan above left this
     box showing the OLD allowance — 512000 MB beside a vendor who had just been
     moved to 200 GB. A super admin who then pressed Save would have set an
     override they never meant to, pinning them at the previous plan's figure. */
  useEffect(() => { setMb(storage?.limit_mb ?? 1024); }, [storage?.limit_mb]);

  // the line above the box reads the vendor's REAL limit, not what is being typed (empty read "of MB")
  const usedMb = (Number(storage?.used_bytes || 0) / 1024 / 1024);
  const limitMb = Number(storage?.limit_mb || 0);
  const pct = limitMb > 0 ? Math.min(100, Math.round(usedMb / limitMb * 100)) : 0;
  const fromPlan = storage?.limit_source !== 'override';

  async function save() {
    setBusy(true); setMsg('');
    try {
      // 🧹 empty = no override: the vendor goes back to their plan's storage (it used to save 0 MB and block uploads)
      await api.setVendorStorage(vendorId, String(mb).trim() === '' ? null : Number(mb));
      setMsg('✅ Saved');
      setTimeout(() => setMsg(''), 1800);
      onSaved?.();   // re-read the vendor so the line above shows the limit that now applies
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="sa-limit">
      <div className="sa-limit-use">
        Using <b>{usedMb.toFixed(1)} MB</b> of {limitMb.toLocaleString('en-US')} MB ({pct}%) · {fromPlan ? 'from the plan' : 'set here'}
      </div>
      <progress className={`sa-limit-bar${pct > 90 ? ' is-high' : ''}`} value={pct} max={100} aria-label="Storage used" />
      <div className="sa-limit-row">
        <input type="number" min="0" className="sa-limit-in" value={mb} placeholder="Plan's storage" title="Leave empty to use the plan's storage" onChange={e => setMb(e.target.value)} />
        <span className="sa-limit-unit">MB</span>
        <button className="refresh" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Set limit'}</button>
        {msg && <span className={`sa-limit-msg${msg[0] === '✅' ? ' is-ok' : ''}`}>{msg}</span>}
      </div>
      <div className="sa-limit-hint">Leave the box empty and press Set limit to go back to the plan's storage.</div>
    </div>
  );
}

/* ---------- BUYERS ---------- */
/** 🏷️ a seller's billing state (lib/adminOverview.js) as a badge: its words and its colour */
const BILLING_STATE = {
  owner: ['👑 Owner', 'active'], paying: ['Paying', 'active'], past_due: ['Past due', 'past'], trial: ['Trial', 'trial'], expired: ['Trial ended', 'past'],
};

export function BuyersView({ vendors, overview, onChanged }) {
  const [openId, setOpenId] = useState(null);
  const [delId, setDelId] = useState(null);   // 🗑️ the vendor being deleted
  const [refCount, setRefCount] = useState(0);
  useEffect(() => {
    api.referrals().then(d => setRefCount((d.referrals || []).filter(r => r.status === 'rewarded').length)).catch(() => {});
  }, []);


  return (
    <>
      <div className="sa-stats">
        <StatCard label="💰 Paying Users" value={overview?.paying_total ?? '—'} trend="Stripe subscriptions" cls="up" />
        <StatCard label="🎁 Users on Trials" value={overview?.trial ?? '—'} trend="Not yet paying" cls="warn" />
        <StatCard label="👥 Referrals" value={refCount} trend="Paid · with discount" cls="up" />
        <StatCard label="🆕 New This Month" value={overview?.new_this_month ?? '—'} trend="Signed up this month" cls="neutral" />
      </div>
      <div className="sa-section-title">All Buyers</div>
      <div className="sa-table-wrap">
        <table>
          <thead><tr><th>Buyer</th><th>Plan</th><th>Status</th><th>Storage</th><th></th></tr></thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr><td colSpan="5" className="sa-empty">No buyers yet.</td></tr>
            ) : vendors.map(v => (
              <tr key={v.id}>
                <td className="biz">{v.business_name}</td>
                {/* ⚠️ This showed vendors.plan, a column nothing ever wrote —
                    so every buyer read "starter" whatever they were paying.
                    The real answer comes from the active subscription. */}
                <td>{v.storage?.limit_source === 'plan' ? v.storage.plan_name
                   : v.storage?.limit_source === 'override' ? <span className="sa-muted">Override</span>
                   : <span className="sa-muted">Trial</span>}</td>
                {(() => { const [word, cls] = BILLING_STATE[overview?.states?.[v.id]] || [v.status, v.status]; return <td><span className={`sa-badge ${cls}`}>{word}</span></td>; })()}
                {/* Storage in the LIST, not only behind Manage. This is where a
                    super admin notices someone is nearly full, and a number
                    that needs a click is a number nobody looks at. */}
                <td>{v.storage ? <StorageCell s={v.storage} /> : <span className="sa-muted">—</span>}</td>
                <td className="sa-row-actions">
                  <button className="sa-view-btn" onClick={() => setOpenId(v.id)}>Manage</button>
                  <button type="button" className="sa-del-btn" title="Delete this vendor" aria-label={`Delete ${v.business_name}`} onClick={() => setDelId(v.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId && <VendorDrawer vendorId={openId} onClose={() => setOpenId(null)} />}
      {delId && <DeleteVendorModal vendorId={delId} onClose={() => setDelId(null)} onDeleted={() => { setDelId(null); onChanged?.(); }} />}
      <FormerSubscribers />
    </>
  );
}

/**
 * 💾 One buyer's storage: a bar, the figures, and where the limit came from.
 *
 * Amber past 80% and red past 95% — a vendor at 96% is about to be refused an
 * upload, and that is worth seeing before they write in about it.
 */
function StorageCell({ s }) {
  const pct = Math.min(100, s.percent ?? 0);
  const tone = pct >= 95 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#2dd4bf';
  return (
    <div className="sa-store" title={`${fmtBytes(s.used_bytes)} of ${fmtMb(s.limit_mb)} — limit from ${s.limit_source}`}>
      <div className="sa-store-bar"><span style={{ width: pct + '%', background: tone }} /></div>
      <div className="sa-store-txt">
        {fmtBytes(s.used_bytes)} / {fmtMb(s.limit_mb)}
        {s.limit_source === 'override' && <span className="sa-store-tag">set</span>}
      </div>
    </div>
  );
}

/** Bytes a person can read — MB below a gigabyte, GB above, TB above that. */
function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1099511627776) return (b / 1099511627776).toFixed(2) + ' TB';
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576) return Math.round(b / 1048576) + ' MB';
  return Math.max(0, Math.round(b / 1024)) + ' KB';
}
function fmtMb(mb) {
  const m = Number(mb) || 0;
  return m >= 1024 ? (m / 1024 >= 100 ? Math.round(m / 1024) : (m / 1024).toFixed(0)) + ' GB' : m + ' MB';
}

/* ---------- BILLING ---------- */
/* ---------- BILLING ----------
   💳 Real figures (GET /admin/overview): what paying sellers bring in at today's plan prices, the trials, and who is
   past due. They used to be invented — $6.4k MRR, $76.8k ARR, 19 trials, 3 past due with "▲ 8.2%". */
