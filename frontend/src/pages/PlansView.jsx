import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './plans.css';

/** The features a plan grants, in words a vendor would use. */
const FEATURE_LABEL = {
  galleries: '📸 Galleries', leads: '📋 Leads & Bookings', contracts: '📄 Contracts & Invoices',
  calendar: '📅 Calendar', crew: '👷 Crew', chatbot: '🤖 AI Chat',
  website: '🌐 Website Builder', fileflyer: '📤 File Flyer',
};

/**
 * 💳 What this vendor is on, and what else they could be on.
 *
 * Opened from two places that both used to be dead ends: the Upgrade button
 * under the storage bar, and the "Off" badges in My Services, which told a
 * vendor a feature was unavailable without saying what to do about it.
 */
export default function PlansView() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.myPlans().then(setD).catch(e => setErr(e.message));
  }, []);

  if (err) return <div className="pl-quiet">Could not load plans — {err}</div>;
  if (!d) return <div className="pl-quiet">Loading…</div>;

  const pct = Math.min(100, d.current.percent ?? 0);
  const gb = (b) => (Number(b) / 1073741824).toFixed(1);

  return (
    <div className="pl">
      <div className="pl-now">
        <div className="pl-now-head">
          <span className="pl-now-label">You are on</span>
          <span className="pl-now-name">{d.current.name}</span>
        </div>
        <div className="pl-now-bar"><span style={{ width: pct + '%' }} /></div>
        <div className="pl-now-figs">
          {gb(d.current.used_bytes)} GB of {d.current.limit_gb} GB used
        </div>
        {/* A vendor given extra space by hand would otherwise upgrade and see
            no change, because the override keeps winning. */}
        {d.current.overridden && (
          <p className="pl-note">
            Your storage has been set for you, so it will not change with a plan.
          </p>
        )}
      </div>

      <div className="pl-grid">
        {d.plans.map(p => (
          <div key={p.id} className={`pl-card ${p.current ? 'is-current' : ''}`}>
            {p.current && <span className="pl-tag">Your plan</span>}
            <h3>{p.icon ? p.icon + ' ' : ''}{p.name}</h3>
            {p.tagline && <p className="pl-tagline">{p.tagline}</p>}

            <div className="pl-price">
              <b>${p.price_monthly}</b><span>/month</span>
            </div>
            <div className="pl-storage">{p.storage_gb} GB of storage</div>

            {p.features.length > 0 ? (
              <ul className="pl-feats">
                {p.features.map(f => <li key={f}>{FEATURE_LABEL[f] || f}</li>)}
              </ul>
            ) : (
              /* Said rather than hidden: a plan with nothing attached is a
                 configuration gap, and a blank card looks like a mistake the
                 vendor made. */
              <p className="pl-quiet pl-feats-none">No features listed on this plan yet.</p>
            )}

            {p.current ? (
              <button className="pl-b" disabled>Current plan</button>
            ) : p.upgrade ? (
              <a className="pl-b is-primary" href="mailto:hello@iwopo.com?subject=Upgrade%20my%20plan">
                Upgrade to {p.name}
              </a>
            ) : (
              <button className="pl-b" disabled>Smaller than your plan</button>
            )}
          </div>
        ))}
      </div>

      {/* Nothing takes a payment yet, and a button that pretends to would be
          worse than one that does not exist. */}
      <p className="pl-foot">
        To change your plan, get in touch and we will move you across.
      </p>
    </div>
  );
}
