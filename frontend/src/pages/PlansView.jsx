import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import PlanTable, { planPriceOf } from '../components/PlanTable';
import './plans.css';

const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;
const date = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '');

/**
 * 💳 Plans — what this vendor is on, and how to change it (2026-10-31: real payments with Stripe).
 *
 * Choosing a plan opens Stripe Checkout (in the vendor's own currency); billing starts when the free trial ends, so
 * choosing early never costs free days. Once subscribed, "Manage billing" opens Stripe's portal for the card, plan,
 * monthly ↔ yearly and cancelling. Storage is shown as before.
 * The plans are the shared PlanTable (2026-11-11) — the pricing page's table and rows, at the vendor's own prices.
 */
export default function PlansView() {
  const [d, setD] = useState(null);
  const [b, setB] = useState(null);
  const [cycle, setCycle] = useState('monthly');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  // done | cancelled (from Stripe) — read once, then taken out of the address, so a later sign-in in the same tab
  // doesn't land on someone else's "Thank you" (Muse F-06)
  const [back] = useState(() => new URLSearchParams(window.location.search).get('billing'));
  useEffect(() => { if (back) window.history.replaceState(null, '', window.location.pathname); }, [back]);

  const load = () => Promise.all([api.myPlans(), api.billing()])
    .then(([plans, billing]) => { setD(plans); setB(billing); if (billing.subscription?.cycle) setCycle(billing.subscription.cycle); })
    .catch(e => setErr(e.message));
  useEffect(() => {
    load();
    // Stripe tells iwopo a moment after the vendor lands back here — look again shortly
    if (back === 'done') { const t = setTimeout(load, 4000); return () => clearTimeout(t); }
    return undefined;
  }, [back]);

  if (err) return <div className="pl-quiet">Could not load plans — {err}</div>;
  if (!d || !b) return <div className="pl-quiet">Loading…</div>;
  // 📊 the pricing table at this vendor's own prices — the same country checkout charges in (GET /api/billing)
  const table = b.table;

  const pct = Math.min(100, d.current.percent ?? 0);
  const gb = (x) => (Number(x) / 1073741824).toFixed(1);
  const sub = b.subscription;

  async function choose(planId) {
    setBusy(planId); setErr('');
    try { const r = await api.billingCheckout(planId, cycle); window.location.href = r.url; }
    catch (e) { setErr(e.message); setBusy(''); }
  }
  /** each plan's button in the table: nothing for the owner, the vendor's own plan as a state, else switch or choose */
  const ctaFor = (p) => {
    if (b.state === 'owner') return null;
    if (sub?.plan_id === p.id) return { label: 'Current plan', disabled: true };
    if (sub) return { label: 'Switch in billing', onClick: manage, disabled: busy === 'portal' };
    return { label: busy === p.id ? 'Opening checkout…' : `Choose ${p.name}`, onClick: () => choose(p.id), disabled: !b.ready || !!busy };
  };
  const currentCode = table.plans.find(p => p.id === sub?.plan_id)?.code;
  // 🔁 Monthly / Yearly, shown in the table's top-left corner, next to the prices it changes (owners are never billed)
  const cycleSwitch = b.state === 'owner' ? null : (
    <div className="pl-cycle" role="group" aria-label="Billing cycle">
      <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
      <button type="button" className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>Yearly <span className="pl-save">up to 2 months free</span></button>
    </div>
  );

  async function manage() {
    setBusy('portal'); setErr('');
    try { const r = await api.billingPortal(); window.location.href = r.url; }
    catch (e) { setErr(e.message); setBusy(''); }
  }

  return (
    <div className="pl">
      {back === 'cancelled' && <div className="pl-banner">No change made — choose a plan whenever you’re ready.</div>}

      {/* 📏 the trial (or plan) and the storage side by side, so the plans start higher up (2026-11-11) */}
      <div className="pl-top">
        <div className="pl-state">
          {b.state === 'owner' && <p>👑 <b>Owner account</b> — never billed.</p>}
          {b.state === 'trial' && !sub && (
            <p>🆓 <b>{b.trial_days_left} {b.trial_days_left === 1 ? 'day' : 'days'} left</b> in your free trial (until {date(b.trial_ends_at)}).
              Choose a plan any time — <b>billing starts only when the trial ends</b>.</p>
          )}
          {b.state === 'expired' && (
            <p className="pl-state-warn">💳 <b>Your free trial has ended.</b> Your features are paused — your clients, galleries and files are safe. Choose a plan to switch everything back on.</p>
          )}
          {sub && (
            <p>✅ <b>{b.plans.find(p => p.id === sub.plan_id)?.name || 'Your plan'}</b>, {sub.cycle === 'annual' ? 'yearly' : 'monthly'}
              {sub.status === 'trialing'
                ? <> — free until {date(sub.renews_at)}, then {money(sub.cycle === 'annual' ? b.plans.find(p => p.id === sub.plan_id)?.annual : b.plans.find(p => p.id === sub.plan_id)?.monthly)}/{sub.cycle === 'annual' ? 'year' : 'month'}</>
                : sub.cancels ? <> — ends {date(sub.renews_at)}</> : <> — renews {date(sub.renews_at)}</>}
              {sub.status === 'past_due' && <span className="pl-state-warn"> · ⚠️ last payment didn’t go through — please update your card</span>}
            </p>
          )}
          {sub && <button type="button" className="pl-b is-primary pl-manage" disabled={busy === 'portal'} onClick={manage}>{busy === 'portal' ? 'Opening…' : '💳 Manage billing'}</button>}
        </div>

        <div className="pl-now">
          <div className="pl-now-head">
            <span className="pl-now-label">Storage</span>
            <span className="pl-now-name">{d.current.name}</span>
          </div>
          <div className="pl-now-bar"><span style={{ width: pct + '%' }} /></div>
          <div className="pl-now-figs">{gb(d.current.used_bytes)} GB of {d.current.limit_gb} GB used</div>
          {d.current.overridden && <p className="pl-note">Your storage has been set for you, so it will not change with a plan.</p>}
        </div>
      </div>

      <PlanTable plans={table.plans} groups={table.groups} notes={table.notes} priceOf={(p) => planPriceOf(p, cycle)}
        ctaFor={ctaFor} currentCode={currentCode} showTrial={false} corner={cycleSwitch} />
      {err && <p className="pl-banner is-bad">⚠️ {err}</p>}
      <p className="pl-foot">Prices are fixed in your country’s currency (in US dollars where iwopo has none) and shown before tax. Cancel any time; you keep your plan until the end of the period.</p>
    </div>
  );
}
