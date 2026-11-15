import { useEffect, useState, useId } from 'react';
import { api, fmtDateTime, fmtMoney } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';

/**
 * ➕ My Services (Raj, 2026-11-06): the plan a vendor is on, what it includes (the same lines as the pricing page —
 * lib/planCatalog.js), and the add-ons they can put on top: added now and charged the difference, removed from the
 * next bill and kept until the paid period ends. Add-ons not open to them say why rather than hide.
 */
export default function MyServicesView({ onPlans }) {
  const offersId = useId();   // the offers switch is named by its label
  const dialog = useDialog();
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
    if (a.local) return `${fmtMoney(a.cycle === 'annual' ? a.local.price_annual : a.local.price, { currency: a.local.currency })}${unit}`;   // 🌍 the fixed price in their currency
    return `$${a.cycle === 'annual' ? a.price_annual : a.price}${unit}`;
  };
  const planNames = (codes) => codes.map(c => c[0].toUpperCase() + c.slice(1)).join(' & ');


  /* 📬 offers and news from iwopo — their consent, theirs to change */
  async function setOffers(on) {
    setBusy('offers'); setMsg('');
    try { await api.billingMarketing(on); await load(); setMsg(on ? '📬 You will get occasional offers and news' : 'No more offers or news emails'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(0); }
  }

  async function act(a, add) {
    if (!add && !await dialog.confirm('It comes off your next bill and keeps working until the end of this billing period.', { title: `Remove ${a.name}?`, okLabel: 'Remove' })) return;
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
      case 'included': return <span className="svx-pill is-in">In your plan</span>;
      case 'added': return <><span className="svx-pill is-in">Active</span><button type="button" className="refresh svx-btn" disabled={busy === a.id} onClick={() => act(a, false)}>Remove</button></>;
      case 'ending': return <><span className="svx-note">Ends {fmtDateTime(a.ends_at, { dateOnly: true })}</span><button type="button" className="refresh svx-btn" disabled={busy === a.id} onClick={() => act(a, true)}>Keep it</button></>;
      case 'coming': return <span className="svx-pill">Coming soon</span>;
      case 'not_on_plan': return <span className="svx-note">On {planNames(a.plans)}</span>;
      case 'choose_plan': return <button type="button" className="refresh svx-btn" onClick={onPlans}>Choose a plan first</button>;
      default: return <button type="button" className="refresh svx-btn" disabled={busy === a.id} onClick={() => act(a, true)}>{busy === a.id ? 'Adding…' : 'Add'}</button>;
    }
  };

  /* Words only (Raj, 2026-11-15): the catalogue's emoji stay with the pricing page; here a plain tick marks what is included */
  return (
    <div className="svx">
      <section className="svx-plan">
        <div>
          <span className="svx-label">Your plan</span>
          <h2 className="svx-plan-name">{cur.name}{cur.reason === 'trial' && <span className="svx-pill is-in">Free trial</span>}</h2>
          {card?.tagline && <p className="svx-plan-sub">{card.tagline}</p>}
        </div>
        <button type="button" className="refresh svx-change" onClick={onPlans}>{trialOrFree ? 'Choose a plan' : 'Change plan'}</button>
      </section>

      <section className="svx-sec">
        <h3 className="svx-h">Included in your plan</h3>
        {card
          ? <ul className="svx-lines">{card.lines.map(l => <li key={l.key} className={l.coming ? 'is-coming' : ''}>{l.name}{l.coming && <span className="svx-pill">Soon</span>}</li>)}</ul>
          : <p className="svx-quiet">Free: your inquiry form, leads and packages. Choose a plan to send contracts and take bookings.</p>}
      </section>

      <section className="svx-sec">
        <h3 className="svx-h">Add-ons</h3>
        <div className="svx-addons">
          {b.addons.map(a => (
            <div key={a.id} className={`svx-addon is-${a.state}`}>
              <div className="svx-addon-main">
                <span className="svx-addon-name">{a.name}</span>
                {a.description && <span className="svx-addon-desc">{a.description}</span>}
              </div>
              <span className="svx-addon-price">{per(a)}</span>
              <span className="svx-addon-act">{action(a)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="svx-sec svx-pref">
        <div className="svx-pref-text">
          <span className="svx-pref-label" id={offersId}>Offers &amp; news from iwopo</span>
          <span className="svx-note">{b.marketing_opt_in ? 'On — the odd offer or update, never more' : 'Off'}</span>
        </div>
        <button type="button" role="switch" aria-labelledby={offersId} aria-checked={!!b.marketing_opt_in} disabled={busy === 'offers'}
          className={`svx-switch${b.marketing_opt_in ? ' is-on' : ''}`} onClick={() => setOffers(!b.marketing_opt_in)}>
          <span className="svx-switch-knob" />
        </button>
      </section>
      {msg && <p className="svx-msg">{msg}</p>}
    </div>
  );
}
