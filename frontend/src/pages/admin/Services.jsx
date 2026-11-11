/**
 * 🛠️ Services & Packages: plans, their prices by country, and services sold on their own.
 * Moved out of pages/Dashboard.jsx (Super Admin) unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { useDialog } from '../../lib/dialog.jsx';
import PlanEditorTable from '../../components/PlanEditorTable';
import RegionPricesTable from '../../components/RegionPricesTable';

/* ---------- SERVICES & PACKAGES ---------- */
export function ServicesView() {
  const [rev, setRev] = useState(0);   // bumps when the pricing table saves, so the standalone list re-reads the same add-on rows
  const dialog = useDialog();
  const [offers, setOffers] = useState([]);
  const [showOffer, setShowOffer] = useState(false);
  const [nf, setNf] = useState({ code: '', label: '', percent_off: '', ends_at: '' });

  useEffect(() => { loadOffers(); }, []);
  async function loadOffers() {
    try { const d = await api.offers(); setOffers(d.offers || []); } catch {}
  }
  async function addOffer() {
    if (!nf.code || !nf.percent_off) return dialog.alert('A coupon needs both a code and a percentage off.', { title: 'Missing details', error: true });
    try {
      await api.createOffer({ ...nf, percent_off: Number(nf.percent_off) });
      setNf({ code: '', label: '', percent_off: '', ends_at: '' });
      setShowOffer(false);
      loadOffers();
    } catch (e) { dialog.alert(e.message, { error: true }); }
  }

  return (
    <>
      {/* OFFERS */}
      <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-bottom-10px">
        <div className="sa-section-title u-margin-0">Offers & Discounts 🎁</div>
        <button className="sa-view-btn" onClick={() => setShowOffer(!showOffer)}>
          {showOffer ? '✕ Cancel' : '+ New Offer'}
        </button>
      </div>

      {showOffer && (
        <div className="sa-box u-margin-bottom-12px">
          <div className="sa-offer-form">
            <input placeholder="CODE (e.g. SUMMER20)" value={nf.code} onChange={e => setNf({ ...nf, code: e.target.value.toUpperCase() })} />
            <input placeholder="Label" value={nf.label} onChange={e => setNf({ ...nf, label: e.target.value })} />
            <input className="u-width-80px" placeholder="% off" type="number" value={nf.percent_off} onChange={e => setNf({ ...nf, percent_off: e.target.value })} />
            <input placeholder="Ends" type="date" value={nf.ends_at} onChange={e => setNf({ ...nf, ends_at: e.target.value })} />
            <button className="sa-btn-teal" onClick={addOffer}>Create</button>
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div className="sa-offer-list">
          {offers.map(o => (
            <div key={o.id} className={`sa-offer-chip ${o.active ? '' : 'off'}`}>
              <span className="oc-code">🏷️ {o.code}</span>
              <span className="oc-pct">{o.percent_off}% off</span>
              {o.label && <span className="oc-label">{o.label}</span>}
              {o.ends_at && <span className="oc-end">till {String(o.ends_at).slice(0, 10)}</span>}
              <button onClick={async () => { await api.toggleOffer(o.id); loadOffers(); }} title="toggle">{o.active ? '🟢' : '⚪'}</button>
              <button onClick={async () => { if (await dialog.confirm('This offer will be deleted.', { title: 'Delete offer?', okLabel: 'Delete' })) { await api.deleteOffer(o.id); loadOffers(); } }} title="delete">🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* PACKAGES — the public pricing table, editable in place (components/PlanEditorTable.jsx) */}
      <div className="sa-section-title sa-pt-title">Packages & Pricing 🎁</div>
      <PlanEditorTable onSaved={() => setRev(r => r + 1)} />
      {/* 🌍 every territory's fixed prices and the profit from each plan (components/RegionPricesTable.jsx) */}
      <RegionPricesTable rev={rev} />

      {/* STANDALONE SERVICES */}
      <StandaloneServices rev={rev} />
    </>
  );
}

function StandaloneServices({ rev = 0 }) {
  const [services, setServices] = useState([]);
  const [edit, setEdit] = useState(false);
  useEffect(() => { load(); }, [rev]);
  function load() { api.adminServices().then(d => setServices((d.services || []).filter(s => Number(s.price) > 0))).catch(() => {}); }
  return (
    <>
      <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-bottom-4px u-margin-top-22px">
        <div className="sa-section-title u-margin-0">Standalone Services 🧩</div>
        <button className={`sa-view-btn ${edit ? 'active-btn' : ''}`} onClick={() => setEdit(!edit)}>
          {edit ? '✓ Done' : '✏️ Edit Prices'}
        </button>
      </div>
      <div className="sa-hint u-margin-top-0 u-margin-bottom-14px">
        {edit ? 'Click a price to change it, then Save. Shows live on the public page.' : 'Individual services sold on their own.'}
      </div>
      <div className="sa-pkg-grid">
        {services.map(s => (
          <div key={s.id} className="sa-box u-display-flex u-flex-direction-column u-gap-6px">
            <div className="u-font-size-26px">{s.icon}</div>
            <div className="u-font-weight-700">{s.name}{s.is_addon ? ' · add-on' : ''}</div>
            {edit
              ? <><ServicePriceEditor service={s} onSaved={load} />{s.tiers && <TierEditor service={s} onSaved={load} />}<CountryPriceEditor type="service" item={s} onSaved={load} /></>
              : <>
                  <div className="u-font-size-22px u-font-weight-800">{s.tiers ? 'from ' : ''}${s.price}<span className="u-font-size-12px u-color-muted">/mo</span>{s.price_annual ? <span className="u-font-size-12px u-color-muted u-display-block u-font-weight-600">${s.price_annual}/yr</span> : null}</div>
                  {s.tiers && (
                    <div className="u-margin-top-4px">
                      {s.tiers.map(t => (
                        <div className="u-display-flex u-justify-content-space-between u-font-size-13px u-padding-2px-0 u-color-muted" key={t.label}>
                          <span>{t.label}</span><span className="u-color-text u-font-weight-600">${t.price}/mo{t.price_annual ? ` · $${t.price_annual}/yr` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <CountryPriceList cp={s.country_prices} />
                </>}
          </div>
        ))}
      </div>
    </>
  );
}

// read a country_prices entry (number legacy OR {m,y}) → {m, y}
function cpEntry(v) {
  if (v == null) return { m: null, y: null };
  if (typeof v === 'object') return { m: v.m ?? null, y: v.y ?? null };
  return { m: v, y: null };
}

function CountryPriceList({ cp }) {
  const entries = Object.entries(cp || {}).filter(([k]) => k !== 'default');
  if (!entries.length) return null;
  const nameOf = (c) => COUNTRIES.find(x => x.code === c)?.name || c;
  return (
    <div className="u-margin-top-6px u-border-top-1px-dashed-line u-padding-top-6px">
      <div className="u-font-size-10px u-color-muted u-margin-bottom-3px">🌍 Exceptions</div>
      {entries.map(([c, v]) => {
        const e = cpEntry(v);
        return (
          <div className="u-display-flex u-justify-content-space-between u-font-size-12px u-padding-1px-0 u-color-muted" key={c}>
            <span>{nameOf(c)}</span>
            <span className="u-color-text u-font-weight-600">${e.m}/mo{e.y ? ` · $${e.y}/yr` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function CountryPriceEditor({ type, item, onSaved }) {
  const dialog = useDialog();
  const [cp, setCp] = useState(item.country_prices || {});
  const [country, setCountry] = useState('CA-BC');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(next) {
    setSaving(true);
    try { await api.updateCountryPrices(type, item.id, next); setCp(next); onSaved && onSaved(); }
    catch (e) { dialog.alert(e.message, { title: 'Save failed', error: true }); }
    finally { setSaving(false); }
  }
  function add() {
    if (m === '') return;
    save({ ...cp, [country]: { m: Number(m), y: y === '' ? null : Number(y) } });
    setM(''); setY('');
  }
  function remove(code) {
    const n = { ...cp }; delete n[code]; save(n);
  }
  const nameOf = (c) => COUNTRIES.find(x => x.code === c)?.name || c;

  return (
    <div className="u-margin-top-8px u-border-top-1px-dashed-line u-padding-top-8px">
      <div className="u-font-size-11px u-color-muted u-margin-bottom-6px">🌍 Country exceptions (default = USD)</div>
      {Object.entries(cp).map(([c, v]) => {
        const e = cpEntry(v);
        return (
          <div className="u-display-flex u-justify-content-space-between u-font-size-12_5px u-padding-2px-0" key={c}>
            <span>{nameOf(c)}</span>
            <span className="u-display-flex u-gap-8px"><b>${e.m}/mo{e.y ? ` · $${e.y}/yr` : ''}</b><span className="u-cursor-pointer" onClick={() => remove(c)}>🗑️</span></span>
          </div>
        );
      })}
      <div className="u-display-flex u-gap-5px u-margin-top-6px u-flex-wrap-wrap">
        <select className="u-background-panel-2 u-border-1px-solid-line u-border-radius-6px u-color-text u-padding-6px-8px u-flex-1 u-font-size-12px u-min-width-140px" value={country} onChange={e => setCountry(e.target.value)}>
          {COUNTRIES.filter(c => c.code !== 'default').map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-6px u-color-text u-padding-6px-8px u-width-60px" type="number" placeholder="mo$" value={m} onChange={e => setM(e.target.value)} />
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-6px u-color-text u-padding-6px-8px u-width-60px" type="number" placeholder="yr$" value={y} onChange={e => setY(e.target.value)} />
        <button className="sa-btn-teal u-padding-5px-10px" onClick={add} disabled={saving}>+</button>
      </div>
    </div>
  );
}

function TierEditor({ service, onSaved }) {
  const dialog = useDialog();
  const [tiers, setTiers] = useState(() => (service.tiers || []).map(t => ({ ...t })));
  const [saving, setSaving] = useState(false);
  const set = (i, k, v) => setTiers(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  async function save() {
    setSaving(true);
    try {
      const clean = tiers.map(t => ({ label: t.label, price: Number(t.price) || 0, price_annual: t.price_annual === '' || t.price_annual == null ? null : Number(t.price_annual) }));
      await api.updateServiceTiers(service.id, clean);
      onSaved && onSaved();
    } catch (e) { dialog.alert(e.message, { title: 'Save failed', error: true }); }
    finally { setSaving(false); }
  }
  return (
    <div className="u-margin-top-8px u-border-top-1px-dashed-line u-padding-top-8px">
      <div className="u-font-size-11px u-color-muted u-margin-bottom-6px">📦 Tiers (mo / yr)</div>
      {tiers.map((t, i) => (
        <div className="u-display-flex u-gap-5px u-align-items-center u-margin-bottom-5px" key={i}>
          <span className="u-width-46px u-font-size-12px">{t.label}</span>
          <span className="u-font-size-11px u-color-muted">$</span>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-6px u-color-text u-padding-5px-7px u-width-62px" type="number" value={t.price} onChange={e => set(i, 'price', e.target.value)} />
          <span className="u-font-size-11px u-color-muted">yr$</span>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-6px u-color-text u-padding-5px-7px u-width-62px" type="number" placeholder="—" value={t.price_annual ?? ''} onChange={e => set(i, 'price_annual', e.target.value)} />
        </div>
      ))}
      <button className="sa-btn-teal u-padding-5px-12px u-margin-top-4px" onClick={save} disabled={saving}>{saving ? '…' : 'Save tiers'}</button>
    </div>
  );
}

function ServicePriceEditor({ service, onSaved }) {
  const dialog = useDialog();
  const [p, setP] = useState(service.price ?? '');
  const [pa, setPa] = useState(service.price_annual ?? '');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.updateServicePrice(service.id, {
        price: p === '' ? 0 : Number(p),
        price_annual: pa === '' ? null : Number(pa),
        price_annual_regular: service.price_annual_regular ?? null,
      });
      onSaved && onSaved();
    } catch (e) { dialog.alert(e.message, { title: 'Save failed', error: true }); }
    finally { setSaving(false); }
  }
  return (
    <div className="u-display-flex u-flex-direction-column u-gap-6px">
      <div className="u-display-flex u-gap-5px u-align-items-center">
        <span className="u-color-muted u-font-size-12px">mo $</span>
        <input className="u-width-68px u-background-panel-2 u-border-1px-solid-line u-border-radius-6px u-color-text u-padding-5px-8px" type="number" value={p} onChange={e => setP(e.target.value)} />
      </div>
      <div className="u-display-flex u-gap-5px u-align-items-center">
        <span className="u-color-muted u-font-size-12px">yr $</span>
        <input className="u-width-68px u-background-panel-2 u-border-1px-solid-line u-border-radius-6px u-color-text u-padding-5px-8px" type="number" value={pa} onChange={e => setPa(e.target.value)} placeholder="—" />
        <button className="sa-btn-teal u-padding-5px-12px" onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</button>
      </div>
    </div>
  );
}
