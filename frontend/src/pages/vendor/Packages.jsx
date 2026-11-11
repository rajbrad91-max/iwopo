/**
 * 📦 My Packages: package templates and their cards.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { useDialog } from '../../lib/dialog.jsx';
import { api, moneySymbol } from '../../lib/api';

export function PackagesView() {
  const dialog = useDialog();
  const [tpls, setTpls] = useState([]);
  const [selTpl, setSelTpl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const d = await api.pkgTemplates();
      setTpls(d.templates || []);
      if (selTpl) {
        const upd = (d.templates || []).find(t => t.id === selTpl.id);
        setSelTpl(upd || null);
      }
    } catch {}
    finally { setLoading(false); }
  }
  async function addTpl() {
    setMsg('');
    try { await api.addTemplate('New Event'); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function delTpl(id) {
    if (!await dialog.confirm('The folder and every package inside it will be deleted.', { title: 'Delete this folder?', okLabel: 'Delete' })) return;
    try { await api.deleteTemplate(id); setSelTpl(null); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function addPkg(tplId) {
    setMsg('');
    try { await api.addVendorPackage('New Package', tplId); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }
  async function delPkg(id) {
    if (!await dialog.confirm('This package will be deleted from the folder.', { title: 'Delete package?', okLabel: 'Delete' })) return;
    try { await api.deleteVendorPackage(id); load(); }
    catch (e) { setMsg('⚠️ ' + e.message); }
  }

  if (loading) return <div className="loading">Loading…</div>;

  // ---- INSIDE A TEMPLATE ----
  if (selTpl) return (
    <div className="u-max-width-720px">
      <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-bottom-12px">
        <button className="refresh" onClick={() => setSelTpl(null)}>← All templates</button>
        {selTpl.packages.length < 3 && (
          <button className="refresh u-background-2dd4bf u-color-06231f" onClick={() => addPkg(selTpl.id)}>+ Add Package</button>
        )}
      </div>
      <h2 className="u-margin-0-0-12px">📁 {selTpl.name}</h2>
      {msg && <div className="err-banner">{msg}</div>}
      <div className="u-display-flex u-flex-direction-column u-gap-14px">
        {selTpl.packages.length === 0 && <div className="u-color-muted">No packages yet — add one 👆</div>}
        {selTpl.packages.map(p => <PkgCard key={p.id} pkg={p} onSaved={load} onDelete={() => delPkg(p.id)} />)}
      </div>
    </div>
  );

  // ---- TEMPLATE LIST ----
  return (
    <div className="u-max-width-720px">
      <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-bottom-12px">
        <div className="u-color-muted u-font-size-13px">📁 Up to 6 event templates · 📦 3 packages each</div>
        {tpls.length < 6 && <button className="refresh u-background-2dd4bf u-color-06231f" onClick={addTpl}>+ Add Template</button>}
      </div>
      {msg && <div className="err-banner">{msg}</div>}
      <div className="u-display-grid u-grid-template-columns-repeat-auto-fill-minmax-210px-1fr u-gap-14px">
        {tpls.map(t => (
          <div key={t.id} className="table-wrap u-padding-18px u-cursor-pointer u-position-relative" onClick={() => setSelTpl(t)}>
            <div className="u-font-size-30px">📁</div>
            <TplName tpl={t} onSaved={load} />
            <div className="u-color-muted u-font-size-12px u-margin-top-4px">📦 {t.packages.length}/3 packages</div>
            {tpls.length > 1 && (
              <button className="refresh u-position-absolute u-top-10px u-right-10px u-padding-3px-8px"
                onClick={e => { e.stopPropagation(); delTpl(t.id); }}>🗑️</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TplName({ tpl, onSaved }) {
  const [name, setName] = useState(tpl.name);
  async function save() {
    if (name !== tpl.name && name.trim()) {
      try { await api.renameTemplate(tpl.id, name.trim()); onSaved && onSaved(); } catch {}
    }
  }
  return (
    <input className="u-background-transparent u-border-none u-color-text u-font-weight-700 u-font-size-15px u-width-100pct u-margin-top-6px u-outline-none" value={name} onClick={e => e.stopPropagation()} onChange={e => setName(e.target.value)} onBlur={save} />
  );
}

function PkgCard({ pkg, onSaved, onDelete }) {
  const [f, setF] = useState({
    name: pkg.name, base_price: pkg.base_price, included_hours: pkg.included_hours,
    per_hour_price: pkg.per_hour_price,
    inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions : [],
  });
  const [newInc, setNewInc] = useState('');
  const [saved, setSaved] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    setSaved('');
    try {
      await api.updateVendorPackage(pkg.id, {
        ...f, base_price: Number(f.base_price) || 0,
        included_hours: Number(f.included_hours) || 0,
        per_hour_price: Number(f.per_hour_price) || 0,
      });
      setSaved('✅ Saved'); setTimeout(() => setSaved(''), 1500);
      onSaved && onSaved();
    } catch (e) { setSaved('⚠️ ' + e.message); }
  }
  function addInc() {
    if (!newInc.trim()) return;
    set('inclusions', [...f.inclusions, newInc.trim()]);
    setNewInc('');
  }
  function rmInc(i) { set('inclusions', f.inclusions.filter((_, x) => x !== i)); }

  return (
    <div className="table-wrap u-padding-20px">
      <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-bottom-10px">
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-55pct u-font-weight-700 u-font-size-16px" value={f.name} onChange={e => set('name', e.target.value)} />
        <div className="u-display-flex u-gap-8px u-align-items-center">
          {pkg.is_default && <span className="badge active">Default</span>}
          {saved && <span className="u-font-size-12px u-color-4ade80">{saved}</span>}
          {!pkg.is_default && <button className="refresh" onClick={onDelete}>🗑️</button>}
        </div>
      </div>

      <div className="u-display-flex u-gap-10px">
        <div className="u-flex-1">
          <label className="u-font-size-12px u-color-muted">💰 Base price ({moneySymbol()})</label>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" type="number" value={f.base_price} onChange={e => set('base_price', e.target.value)} />
        </div>
        <div className="u-flex-1">
          <label className="u-font-size-12px u-color-muted">⏱️ Included hours</label>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" type="number" value={f.included_hours} onChange={e => set('included_hours', e.target.value)} />
        </div>
        <div className="u-flex-1">
          <label className="u-font-size-12px u-color-muted">➕ Extra {moneySymbol()}/hour</label>
          <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" type="number" value={f.per_hour_price} onChange={e => set('per_hour_price', e.target.value)} />
        </div>
      </div>

      <label className="u-font-size-12px u-color-muted u-display-block u-margin-top-12px">📝 Inclusions (your own items)</label>
      <div className="u-display-flex u-flex-wrap-wrap u-gap-6px u-margin-6px-0">
        {f.inclusions.map((inc, i) => (
          <span className="u-background-2dd4bf18 u-border-1px-solid-2dd4bf44 u-color-2dd4bf u-padding-4px-10px u-border-radius-16px u-font-size-12px" key={i}>
            {inc} <span className="u-cursor-pointer u-margin-left-4px" onClick={() => rmInc(i)}>✕</span>
          </span>
        ))}
        {f.inclusions.length === 0 && <span className="u-color-muted u-font-size-12px">No items yet — add below 👇</span>}
      </div>
      <div className="u-display-flex u-gap-8px">
        <input className="u-background-panel-2 u-border-1px-solid-line u-border-radius-8px u-color-text u-padding-9px u-width-100pct" placeholder="e.g. 8x10 prints, 2 photographers…" value={newInc}
          onChange={e => setNewInc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addInc()} />
        <button className="refresh" onClick={addInc}>+ Add</button>
      </div>

      <button className="refresh u-margin-top-14px u-width-100pct u-background-2dd4bf u-color-06231f" onClick={save}>💾 Save package</button>
    </div>
  );
}
