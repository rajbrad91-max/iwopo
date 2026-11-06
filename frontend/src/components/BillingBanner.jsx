import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * 💳 A quiet line across the panel in the last week of a free trial, and a clear one once it has ended
 * (2026-10-31). Never for owners or paying vendors. "Choose a plan" opens Plans.
 */
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
          ? <>🔒 <b>Your galleries and files are locked.</b> You are {lim.over_by_gb} GB over your plan — delete some or move up a plan to open them again.</>
          : <>💾 <b>You are {lim.over_by_gb} GB over your storage.</b> Delete some files or move up a plan within {lim.days_left} {lim.days_left === 1 ? 'day' : 'days'} — after that your galleries and files are locked.</>}</span>
        <button type="button" className="bb-btn" onClick={onPlans}>See plans</button>
      </div>
    );
  }
  if (!b || b.subscription) return null;
  if (b.state === 'trial' && b.trial_days_left <= 7) {
    return (
      <div className="bb bb-soon" role="status">
        <span>⏳ <b>{b.trial_days_left} {b.trial_days_left === 1 ? 'day' : 'days'} left</b> in your free trial — billing only starts when it ends.</span>
        <button type="button" className="bb-btn" onClick={onPlans}>Choose a plan</button>
      </div>
    );
  }
  if (b.state === 'expired') {
    return (
      <div className="bb bb-soon" role="status">
        <span>🌱 <b>You're on the Free plan.</b> Your leads and inquiry form keep working — choose a plan to send contracts and take bookings.</span>
        <button type="button" className="bb-btn" onClick={onPlans}>Choose a plan</button>
      </div>
    );
  }
  return null;
}
