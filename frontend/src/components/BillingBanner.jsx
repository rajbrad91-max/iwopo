import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * 💳 A quiet line across the panel in the last week of a free trial, and a clear one once it has ended
 * (2026-10-31). Never for owners or paying vendors. "Choose a plan" opens Plans.
 */
export default function BillingBanner({ onPlans }) {
  const [b, setB] = useState(null);
  useEffect(() => { api.billing().then(setB).catch(() => {}); }, []);
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
      <div className="bb bb-ended" role="alert">
        <span>💳 <b>Your free trial has ended.</b> Your features are paused — your data is safe.</span>
        <button type="button" className="bb-btn" onClick={onPlans}>Choose a plan</button>
      </div>
    );
  }
  return null;
}
