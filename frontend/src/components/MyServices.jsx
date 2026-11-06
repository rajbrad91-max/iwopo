import { useEffect, useState } from 'react';
import { api, fmtDateTime, fmtMoney } from '../lib/api';

/**
 * ➕ My Services (Raj, 2026-11-06): the plan a vendor is on, what it includes (the same lines as the pricing page —
 * lib/planCatalog.js), and the add-ons they can put on top: added now and charged the difference, removed from the
 * next bill and kept until the paid period ends. Add-ons not open to them say why rather than hide.
 */
export default function MyServicesView({ onPlans }) {
  const [b, setB] = useState(null);
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState('');
  const load = () => api.billing().then(setB).catch(() => setB({ error: true }));
  useEffect(() => { load(); }, []);
  if (!b) return <div className="tab-loading">Loading…</div>;
  if (b.error) return <p className="svx-msg">⚠️ Could not load your services — please refresh.</p>;

  const cur = b.current_plan || {};
  const card = (b.plans || []).find(p => p.code === cur.code);
  const trialOrFree = cur.code === 'free' || cur.reason === 'trial';
  const per = (a) => {
    const unit = a.cycle === 'annual' ? '/yr' : '/mo';
    if (a.local) return `≈ ${fmtMoney(a.cycle === 'annual' ? a.local.price_annual : a.local.price, { currency: a.local.currency })}${unit}`;   // 🌍 their currency
    return `$${a.cycle === 'annual' ? a.price_annual : a.price}${unit}`;
  };
  const planNames = (codes) => codes.map(c => c[0].toUpperCase() + c.slice(1)).join(' & ');

  async function act(a, add) {
    if (!add && !window.confirm(`Remove ${a.name} from your next bill? It keeps working until the end of this billing period.`)) return;
    setBusy(a.id); setMsg('');
    try {
      await (add ? api.billingAddAddon(a.id) : api.billingRemoveAddon(a.id));
      await load();
      setMsg(add ? `✅ ${a.name} added` : `${a.name} will end with this billing period`);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(0); }
  }

  const action = (a) => {
    switch (a.state) {
      case 'included': return <span className="badge active">✅ In your plan</span>;
      case 'added': return <><span className="badge active">Active</span><button type="button" className="svx-remove" disabled={busy === a.id} onClick={() => act(a, false)}>Remove</button></>;
      case 'ending': return <><span className="svx-note">Ends {fmtDateTime(a.ends_at, { dateOnly: true })}</span><button type="button" className="svx-add" disabled={busy === a.id} onClick={() => act(a, true)}>Keep it</button></>;
      case 'coming': return <span className="svx-note">Coming soon</span>;
      case 'not_on_plan': return <span className="svx-note">On {planNames(a.plans)}</span>;
      case 'choose_plan': return <button type="button" className="svx-add" onClick={onPlans}>Choose a plan first</button>;
      default: return <button type="button" className="svx-add" disabled={busy === a.id} onClick={() => act(a, true)}>{busy === a.id ? 'Adding…' : 'Add'}</button>;
    }
  };

  return (
    <div className="svx">
      <section className="svx-plan">
        <div>
          <span className="svx-label">Your plan</span>
          <h2 className="svx-plan-name">{card?.icon} {cur.name}{cur.reason === 'trial' ? ' · free trial' : ''}</h2>
        </div>
        <button type="button" className="svx-change" onClick={onPlans}>{trialOrFree ? 'Choose a plan' : 'Change plan'}</button>
      </section>
      {card
        ? <ul className="svx-lines">{card.lines.map(l => <li key={l.key} className={l.coming ? 'is-coming' : ''}>{l.icon} {l.name}{l.coming && <em> · coming soon</em>}</li>)}</ul>
        : <p className="svx-quiet">Free: your inquiry form, leads and packages. Choose a plan to send contracts and take bookings.</p>}

      <h3 className="svx-h">Add-ons</h3>
      <div className="svx-addons">
        {b.addons.map(a => (
          <div key={a.id} className={`svx-addon is-${a.state}`}>
            <div className="svx-addon-main">
              <span className="svx-addon-name">{a.icon} {a.name}</span>
              {a.description && <span className="svx-addon-desc">{a.description}</span>}
            </div>
            <span className="svx-addon-price">{per(a)}</span>
            <span className="svx-addon-act">{action(a)}</span>
          </div>
        ))}
      </div>
      {msg && <p className="svx-msg">{msg}</p>}
    </div>
  );
}
