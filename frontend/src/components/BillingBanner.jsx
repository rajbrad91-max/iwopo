import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * 💳 A quiet line across the panel in the last week of a free trial, and a clear one once access has ended — read-only,
 * then suspended (lib/accountLapse.js, Raj 2026-11-15). Never for owners or paying vendors. "Choose a plan" opens Plans.
 */
const date = (d) => new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

export default function BillingBanner({ onPlans }) {
  const [b, setB] = useState(null);
  const [lim, setLim] = useState(null);
  useEffect(() => {
    api.billing().then(setB).catch(() => {});
    api.limitState().then(setLim).catch(() => {});
  }, []);
  /* 📏 over the storage limit comes first — for paying vendors too (lib/overLimit.js) */
  if (lim?.over) {
    return (
      <div className={`bb ${lim.locked ? 'bb-ended' : 'bb-soon'}`} role={lim.locked ? 'alert' : 'status'}>
        <span>{lim.locked
          ? <><b>Your galleries and files are locked.</b> You are {lim.over_by || `${lim.over_by_gb} GB`} over your plan — delete some or move up a plan to open them again.</>
          : <><b>You are {lim.over_by || `${lim.over_by_gb} GB`} over your storage.</b> Delete some files or move up a plan within {lim.days_left} {lim.days_left === 1 ? 'day' : 'days'} — after that your galleries and files are locked.</>}</span>
        <button type="button" className="bb-btn" onClick={onPlans}>See plans</button>
      </div>
    );
  }
  if (!b || b.subscription) return null;
  /* 💳 a plan chosen at sign-up and not paid for yet: the one next step, in plain words */
  if (b.pending_plan) {
    const pay = async () => { try { const r = await api.billingCheckout(); if (r?.url) window.location.assign(r.url); } catch { onPlans(); } };
    return (
      <div className="bb bb-soon" role="status">
        <span><b>Finish setting up {b.pending_plan.name}.</b> Your account is ready — payment is the last step.</span>
        <button type="button" className="bb-btn" onClick={pay}>Continue to payment</button>
      </div>
    );
  }
  if (b.state === 'trial' && b.trial_days_left <= 7) {
    return (
      <div className="bb bb-soon" role="status">
        <span><b>{b.trial_days_left} {b.trial_days_left === 1 ? 'day' : 'days'} left</b> in your free trial — billing only starts when it ends.</span>
        <button type="button" className="bb-btn" onClick={onPlans}>Choose a plan</button>
      </div>
    );
  }
  if (b.stage === 'readonly' || b.stage === 'suspended') {
    return (
      <div className="bb bb-ended" role="alert">
        <span>{b.stage === 'readonly'
          ? <><b>Your account is read-only.</b> You can look at and download everything, but nothing new comes in — choose a plan before {date(b.suspends_at)} so it isn’t suspended.</>
          : <><b>Your account is suspended.</b> Choose a plan to open it again — from {date(b.removable_from)} your photos, files, leads and bookings can be removed.</>}</span>
        <button type="button" className="bb-btn" onClick={onPlans}>Choose a plan</button>
      </div>
    );
  }
  return null;
}
