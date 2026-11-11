/**
 * 🧩 Manage Services: what each service is and whether it is live.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

/**
 * 📦 How much storage this package includes.
 *
 * Edited on the package rather than per vendor, so raising it here raises it
 * for every vendor on this package at once — which is what makes it a property
 * of what they bought rather than a number someone has to remember to copy onto
 * each account.
 */


/**
 * 🔓 What vendors on this plan actually get (2026-11-01). Shown on every package card; checkboxes in Edit mode.
 * Separate from "INCLUDED" above, which is only what the pricing page lists.
 */


/* ---------- MANAGE SERVICES ---------- */


export function ManageServicesView() {
  // Read from the services table rather than a copy kept here. This list had
  // drifted into its own vocabulary — two separate rows for the one chatbot,
  // and "File Flyer" where the rest of the system said "Storage" — so toggling
  // a service in one screen had no effect on any of the others.
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  useEffect(() => {
    api.adminServices()
      .then(d => setList((d.services || []).filter(s => s.feature_key)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;

  if (active) {
    const svc = list.find(s => s.feature_key === active);
    if (!svc) return null;
    return (
      <>
        <button className="sa-view-btn" onClick={() => setActive(null)}>← Back to services</button>
        <div className="sa-box sa-svc-detail">
          <div className="sa-svc-detail-icon">{svc.icon}</div>
          <h2 className="sa-svc-detail-name">{svc.name}</h2>
          <p className="sa-svc-detail-desc">{svc.description}</p>
          <div className="sa-trial-pill">
            {svc.is_live ? '🚧 Admin panel coming next' : '🏗️ Not built yet — nothing to configure'}
          </div>
        </div>
      </>
    );
  }

  const live = list.filter(s => s.is_live);
  const planned = list.filter(s => !s.is_live);
  const card = (s) => (
    <div key={s.feature_key} className={`sa-manage-card ${s.is_live ? '' : 'is-planned'}`}
      onClick={() => setActive(s.feature_key)}>
      <div className="sa-manage-icon">{s.icon}</div>
      <div className="sa-manage-name">{s.name}</div>
      <div className="sa-manage-desc">{s.description}</div>
      {!s.is_live && <div className="sa-manage-badge">🏗️ Not built yet</div>}
    </div>
  );

  return (
    <>
      <div className="sa-section-title">Manage Services 🛠️</div>
      <div className="sa-hint sa-hint-tight">
        Every service, named the same way here, in a vendor&apos;s plan and in their panel.
        Vendors see only what they subscribe to.
      </div>
      <div className="sa-manage-grid">{live.map(card)}</div>

      {planned.length > 0 && (
        <>
          <div className="sa-section-title sa-section-mt">Planned 🏗️</div>
          <div className="sa-hint sa-hint-tight">
            Sold on the pricing page but not built. Switching one on for a vendor is refused,
            because there would be nothing for them to open.
          </div>
          <div className="sa-manage-grid">{planned.map(card)}</div>
        </>
      )}
    </>
  );
}
