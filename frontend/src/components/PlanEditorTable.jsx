import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { planPriceOf } from './PlanTable';
import './plan-table.css';

/**
 * 📋 Super Admin's pricing table — the public table, editable (Raj, 2026-11-07). Same rows, same look, same
 * stylesheet as components/PlanTable.jsx; in edit mode the cells become inputs and toggles. Every save goes to the
 * tables the backend enforces (plans, plan_features, services), so what is edited here is what visitors see AND
 * what vendors actually get. Computed rows (what fits, card payments) stay read-only and recalculate after a save.
 */
const usd = (n) => `$${Number(n || 0).toFixed(2).replace(/\.00$/, '')}`;
const cellView = (v) => (v === true
  ? <span className="pt-yes" aria-label="Included">✓</span>
  : !v ? <span className="pt-no" aria-label="Not included">—</span>
  : <span className="pt-val">{v}</span>);
const Toggle = ({ on, onChange, title }) => (
  <button type="button" role="switch" aria-checked={on} title={title} className={`pt-tog${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>{on ? '✓' : '—'}</button>
);
const Num = ({ value, onChange, step = 1, min = 0, max }) => (
  <input type="number" className="pt-in" value={value ?? ''} min={min} max={max} step={step} onChange={e => onChange(e.target.value)} />
);

export default function PlanEditorTable({ onSaved }) {
  const [pub, setPub] = useState(null);         // what visitors get: rows, computed cells, the footnote
  const [admin, setAdmin] = useState([]);       // the plans with ids, storage, chats, trial, highlights
  const [unlocks, setUnlocks] = useState(null); // the feature catalog and each plan's keys
  const [services, setServices] = useState([]); // add-ons and their prices
  const [draft, setDraft] = useState(null);     // edit mode: the pending values
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    // 💵 always in US dollars here — the currency prices are set in, whatever country the admin is browsing from
    const [p, a, u, s] = await Promise.all([api.packages('USD'), api.adminPackages(), api.adminPlanUnlocks(), api.adminServices()]);
    const fresh = { pub: p, admin: a.packages || [], unlocks: u, services: (s.services || []).filter(x => x.is_addon) };
    setPub(fresh.pub); setAdmin(fresh.admin); setUnlocks(fresh.unlocks); setServices(fresh.services);
    return fresh;
  }
  useEffect(() => { load().catch(e => setMsg('⚠️ ' + e.message)); }, []);

  const merge = (pubData, adminRows) => (pubData?.packages || []).map(c => ({ ...c, ...(adminRows.find(a => a.code === c.code) || {}) }));
  const plans = useMemo(() => merge(pub, admin), [pub, admin]);
  const featureKeys = useMemo(() => new Set((unlocks?.catalog || []).map(c => c.feature_key)), [unlocks]);
  const byKey = (key) => services.find(s => s.feature_key === key);
  const storagePacks = services.filter(s => s.storage_gb > 0).sort((a, b) => a.storage_gb - b.storage_gb);

  /* editing starts from freshly read rows — the standalone service list below edits the same add-ons */
  async function startEdit() {
    setMsg('');
    let fresh;
    try { fresh = await load(); } catch (e) { setMsg('⚠️ ' + e.message); return; }
    const ps = {};
    for (const p of merge(fresh.pub, fresh.admin)) {
      ps[p.code] = {
        name: p.name, tagline: p.tagline || '', price_monthly: p.price_monthly, price_annual: p.price_annual ?? '',
        storage_gb: p.storage_gb, chat_limit: p.chat_limit, trial_days: p.trial_days,
        features: new Set(fresh.unlocks.plans.find(u => u.code === p.code)?.features || []),
        highlights: (p.lines || []).filter(l => l.key.startsWith('highlight-')).map(l => ({ label: l.name, coming: !!l.coming })),
      };
    }
    const ss = {};
    for (const s of fresh.services) ss[s.id] = { price: s.price, price_annual: s.price_annual ?? '' };
    setDraft({ plans: ps, services: ss, extraLabels: [], newLabel: '' });
  }
  const setPlan = (code, patch) => setDraft(d => ({ ...d, plans: { ...d.plans, [code]: { ...d.plans[code], ...patch } } }));
  const setFeature = (code, key, on) => setDraft(d => { const f = new Set(d.plans[code].features); on ? f.add(key) : f.delete(key); return { ...d, plans: { ...d.plans, [code]: { ...d.plans[code], features: f } } }; });
  const setService = (id, patch) => setDraft(d => ({ ...d, services: { ...d.services, [id]: { ...d.services[id], ...patch } } }));
  const hasHighlight = (code, label) => draft.plans[code].highlights.some(h => h.label === label);
  const comingOf = (label) => Object.values(draft.plans).flatMap(p => p.highlights).find(h => h.label === label)?.coming || false;
  const setHighlight = (code, label, on) => setDraft(d => {
    const list = d.plans[code].highlights.filter(h => h.label !== label);
    if (on) list.push({ label, coming: comingOf(label) });
    return { ...d, plans: { ...d.plans, [code]: { ...d.plans[code], highlights: list } } };
  });
  const setComing = (label, coming) => setDraft(d => ({ ...d, plans: Object.fromEntries(Object.entries(d.plans).map(([c, p]) => [c, { ...p, highlights: p.highlights.map(h => (h.label === label ? { ...h, coming } : h)) }])) }));

  async function save() {
    setBusy(true); setMsg('');
    try {
      // ⚡ only what changed is sent, all plans at once — one edited cell no longer rewrites four plans
      const hl = (list) => JSON.stringify((list || []).map(h => [h.label, !!h.coming]));
      await Promise.all(plans.map(async p => {
        const d = draft.plans[p.code];
        const was = { name: p.name, tagline: p.tagline || '', price_monthly: Number(p.price_monthly), price_annual: p.price_annual == null ? '' : Number(p.price_annual), storage_gb: Number(p.storage_gb), chat_limit: Number(p.chat_limit), trial_days: Number(p.trial_days) };
        const now = { name: d.name, tagline: d.tagline, price_monthly: Number(d.price_monthly), price_annual: d.price_annual === '' ? '' : Number(d.price_annual), storage_gb: Number(d.storage_gb), chat_limit: Number(d.chat_limit), trial_days: Number(d.trial_days) };
        const body = Object.fromEntries(Object.keys(now).filter(k => now[k] !== was[k] && now[k] !== '').map(k => [k, now[k]]));
        const oldHl = (p.lines || []).filter(l => l.key.startsWith('highlight-')).map(l => ({ label: l.name, coming: !!l.coming }));
        if (hl(oldHl) !== hl(d.highlights)) body.highlights = d.highlights;
        if (Object.keys(body).length) await api.saveAdminPlan(p.id, body);
        const before = [...(unlocks.plans.find(u => u.code === p.code)?.features || [])].sort().join(',');
        if (before !== [...d.features].sort().join(',')) await api.saveAdminPlanUnlocks(p.code, [...d.features]);
      }));
      for (const s of services) {
        const d = draft.services[s.id];
        if (Number(d.price) !== Number(s.price) || String(d.price_annual ?? '') !== String(s.price_annual ?? '')) {
          await api.updateServicePrice(s.id, { price: Number(d.price), price_annual: d.price_annual === '' ? null : Number(d.price_annual), price_annual_regular: s.price_annual_regular ?? null });
        }
      }
      await load(); setDraft(null); setMsg('✅ Saved — this is what visitors see, and what vendors get, from now on');
      onSaved?.();
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }

  if (!pub || !unlocks) return <div className="sa-hint">{msg || 'Loading the pricing table…'}</div>;
  const edit = !!draft;
  const groups = pub.compare || [];
  const extraRows = edit ? draft.extraLabels.filter(l => !groups.some(g => g.rows.some(r => r.label === l))) : [];

  /* one row's cell for a plan: the public value, or the matching editor */
  function cell(row, p) {
    const d = edit ? draft.plans[p.code] : null;
    const pubVal = row.cells[p.code];
    if (!edit) return cellView(pubVal);
    if (row.key === 'storage') return <span className="pt-edit"><Num value={d.storage_gb} min={1} onChange={v => setPlan(p.code, { storage_gb: v })} /> GB</span>;
    if (row.key === 'chatbot') return (
      <span className="pt-edit">
        <Toggle on={d.features.has('chatbot')} onChange={on => setFeature(p.code, 'chatbot', on)} title="Wopo Assistant on this plan" />
        {d.features.has('chatbot') && <Num value={d.chat_limit} onChange={v => setPlan(p.code, { chat_limit: v })} />}
      </span>);
    if (row.key === 'capacity' || row.key === 'card_payments' || row.key === 'extra_storage') return <span className="pt-calc" title="Worked out from the other rows">{cellView(pubVal)}</span>;
    if (featureKeys.has(row.key)) return <Toggle on={d.features.has(row.key)} onChange={on => setFeature(p.code, row.key, on)} title={`${row.label} on ${d.name}`} />;
    return <Toggle on={hasHighlight(p.code, row.label)} onChange={on => setHighlight(p.code, row.label, on)} title={`${row.label} on ${d.name}`} />;   // a highlight
  }
  /* the row label, plus the add-on price editors that belong to the row */
  function label(row) {
    const packs = row.key === 'extra_storage' ? storagePacks : [];
    const svc = ['crew', 'custom_domain', 'social_ai'].includes(row.key) ? byKey(row.key) : null;
    const highlight = !featureKeys.has(row.key) && !['storage', 'capacity', 'extra_storage', 'chatbot', 'card_payments'].includes(row.key);
    return (
      <>
        {row.label}{row.star && <span className="pt-star" aria-hidden="true">*</span>}
        {!edit && row.coming && <span className="pt-soon">Coming soon</span>}
        {edit && packs.length > 0 && <span className="pt-edit pt-edit-row">{packs.map(s => <label key={s.id}>{s.name} $<Num value={draft.services[s.id].price} step={0.5} onChange={v => setService(s.id, { price: v })} />/mo</label>)}</span>}
        {edit && svc && <span className="pt-edit pt-edit-row"><label>Add-on price $<Num value={draft.services[svc.id].price} step={0.5} onChange={v => setService(svc.id, { price: v })} />/mo</label>{svc.plan_prices?.studio != null && <span className="pt-note-sm">Studio pays {usd(svc.plan_prices.studio)}</span>}</span>}
        {edit && highlight && <label className="pt-edit pt-edit-row pt-coming"><input type="checkbox" checked={comingOf(row.label)} onChange={e => setComing(row.label, e.target.checked)} /> coming soon</label>}
      </>
    );
  }

  return (
    <div className="sa-pt">
      <div className="sa-pt-bar">
        <div className="sa-hint sa-pt-hint">
          {edit ? '✍️ Change anything, then Save. Prices are in US dollars; features, storage, chats and trial days apply to vendors the moment you save.'
            : '👀 Exactly what visitors see on the pricing page (prices shown here in USD, the currency you set them in).'}
        </div>
        <div className="sa-pt-actions">
          {edit ? (
            <>
              <button type="button" className="sa-btn-teal" disabled={busy} onClick={save}>{busy ? 'Saving…' : '💾 Save changes'}</button>
              <button type="button" className="sa-view-btn" disabled={busy} onClick={() => { setDraft(null); setMsg(''); }}>Cancel</button>
            </>
          ) : <button type="button" className="sa-view-btn" onClick={startEdit}>✏️ Edit plans</button>}
        </div>
      </div>
      {msg && <div className="sa-hint sa-pt-msg">{msg}</div>}

      <div className="pt-wrap pt-scope">
        <table className="pt">
          <thead>
            <tr>
              <th scope="col" className="pt-corner">
                <span className="pt-corner-t">Compare plans</span>
                <span className="pt-corner-s">Everything each plan includes, side by side.</span>
              </th>
              {plans.map(p => {
                const pop = p.code === 'pro';
                const d = edit ? draft.plans[p.code] : null;
                const pr = planPriceOf({ ...p, local: null }, 'monthly');
                return (
                  <th key={p.code} scope="col" className={`pt-plan${pop ? ' is-pop' : ''}`}>
                    {pop && <span className="pt-ribbon">Most popular</span>}
                    {edit ? (
                      <>
                        <input className="pt-in pt-in-name" value={d.name} maxLength={40} onChange={e => setPlan(p.code, { name: e.target.value })} />
                        <input className="pt-in pt-in-tag" value={d.tagline} maxLength={90} placeholder="Tagline" onChange={e => setPlan(p.code, { tagline: e.target.value })} />
                        <span className="pt-edit pt-edit-price">$<Num value={d.price_monthly} step={1} onChange={v => setPlan(p.code, { price_monthly: v })} />/mo</span>
                        <span className="pt-edit pt-edit-price">$<Num value={d.price_annual} step={1} onChange={v => setPlan(p.code, { price_annual: v })} />/yr</span>
                        <span className="pt-edit pt-edit-price"><Num value={d.trial_days} max={365} onChange={v => setPlan(p.code, { trial_days: v })} /> trial days</span>
                      </>
                    ) : (
                      <>
                        <span className="pt-name">{p.name}</span>
                        <span className="pt-tag">{p.tagline}</span>
                        <span className="pt-price"><span className="pt-cur">{pr.cur}</span><span className="pt-big">{pr.big}</span><span className="pt-unit">{pr.unit}</span></span>
                        <span className="pt-note">{p.price_annual ? `or ${usd(p.price_annual)}/yr` : (pr.sub || ' ')}</span>
                        <span className="pt-trial">{p.trial_days > 0 ? `${p.trial_days}-day free trial` : '\u00A0'}</span>
                      </>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map(g => (
            <tbody key={g.title}>
              <tr className="pt-group"><th scope="rowgroup" colSpan={plans.length + 1}>{g.title}</th></tr>
              {g.rows.map(r => (
                <tr key={r.key}>
                  <th scope="row" className="pt-feat">{label(r)}</th>
                  {plans.map(p => <td key={p.code} className={p.code === 'pro' ? 'is-pop' : ''}>{cell(r, p)}</td>)}
                </tr>
              ))}
              {g.title === 'Extras' && extraRows.map(l => (
                <tr key={l}>
                  <th scope="row" className="pt-feat">{l}<label className="pt-edit pt-edit-row pt-coming"><input type="checkbox" checked={comingOf(l)} onChange={e => setComing(l, e.target.checked)} /> coming soon</label></th>
                  {plans.map(p => <td key={p.code} className={p.code === 'pro' ? 'is-pop' : ''}><Toggle on={hasHighlight(p.code, l)} onChange={on => setHighlight(p.code, l, on)} title={`${l} on ${draft.plans[p.code].name}`} /></td>)}
                </tr>
              ))}
              {g.title === 'Extras' && edit && (
                <tr>
                  <th scope="row" className="pt-feat">
                    <span className="pt-edit pt-edit-row">
                      <input className="pt-in pt-in-new" placeholder="New highlight, e.g. Phone support" value={draft.newLabel} maxLength={80} onChange={e => setDraft(d => ({ ...d, newLabel: e.target.value }))} />
                      <button type="button" className="sa-view-btn" onClick={() => { const l = draft.newLabel.trim(); if (l) setDraft(d => ({ ...d, extraLabels: [...d.extraLabels, l], newLabel: '' })); }}>+ Add</button>
                    </span>
                  </th>
                  <td colSpan={plans.length} className="pt-help">Then tick the plans that get it. A highlight nobody has is dropped on save.</td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
        {(pub.compare_notes || []).length > 0 && <div className="pt-notes">{pub.compare_notes.map(n => <p key={n}>{n}</p>)}</div>}
      </div>
    </div>
  );
}
