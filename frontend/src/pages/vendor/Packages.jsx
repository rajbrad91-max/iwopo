/**
 * 📦 My Packages: package templates and their cards.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef } from 'react';
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

  // ---- INSIDE A TEMPLATE: the packages, the editor, and what the client sees ----
  if (selTpl) return (
    <PackagesFolder tpl={selTpl} msg={msg} onBack={() => setSelTpl(null)}
      onAdd={() => addPkg(selTpl.id)} onDelete={delPkg} onSaved={load} />
  );

  // ---- TEMPLATE LIST ----
  return (
    <div className="u-max-width-720px">
      <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-bottom-12px">
        <div className="u-color-muted u-font-size-13px">📁 Up to 6 event templates · 📦 3 packages each</div>
        {tpls.length < 6 && <button className="refresh u-background-teal u-color-acc-ink" onClick={addTpl}>+ Add Template</button>}
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

/* small line icons for this page (the panel's own sidebar and header keep theirs) */
const Icon = ({ d, className = 'pk-ic' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
);
const GRIP = 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01';
const CROSS = 'M18 6 6 18M6 6l12 12';
const CHECK = 'M20 6 9 17l-5-5';
const PLUS = 'M12 5v14M5 12h14';

const money = (v) => `${moneySymbol()}${(Number(v) || 0).toLocaleString()}`;
const formOf = (pkg) => ({
  name: pkg.name, base_price: pkg.base_price, included_hours: pkg.included_hours,
  per_hour_price: pkg.per_hour_price,
  inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions : [],
});

/**
 * 📦 Inside a folder (Raj, 2026-11-12): the packages listed on the left, the chosen one edited in the middle, and on
 * the right exactly how it reads to a client. Leaving a package with unsaved changes asks first.
 */
function PackagesFolder({ tpl, msg, onBack, onAdd, onDelete, onSaved }) {
  const dialog = useDialog();
  const pkgs = tpl.packages;
  const [selId, setSelId] = useState(pkgs[0]?.id ?? null);
  const dirty = useRef(false);
  const count = useRef(pkgs.length);
  // a package just added is opened; a deleted one hands over to the first
  useEffect(() => {
    if (pkgs.length > count.current) setSelId(pkgs[pkgs.length - 1].id);
    else if (!pkgs.some(p => p.id === selId)) setSelId(pkgs[0]?.id ?? null);
    count.current = pkgs.length;
  }, [pkgs, selId]);
  const sel = pkgs.find(p => p.id === selId) || null;

  async function leaveOk() {
    return !dirty.current || dialog.confirm('Your changes to this package are not saved yet.', { title: 'Leave without saving?', okLabel: 'Leave' });
  }
  async function pick(id) { if (id !== selId && await leaveOk()) { dirty.current = false; setSelId(id); } }

  return (
    <div className="pk-page">
      <div className="pk-top">
        <button className="refresh" onClick={async () => { if (await leaveOk()) onBack(); }}>← All templates</button>
      </div>
      {msg && <div className="err-banner">{msg}</div>}
      <div className="pk-panes">
        <div className="pk-card pk-list">
          <div className="pk-head"><h3>{tpl.name}</h3><span className="pk-faint">{pkgs.length} of 3</span></div>
          {pkgs.map(p => (
            <button type="button" key={p.id} className={`pk-item ${p.id === selId ? 'is-on' : ''}`} onClick={() => pick(p.id)}>
              <span className="pk-item-name"><b>{p.name}</b>
                <small>{(p.inclusions || []).length} item{(p.inclusions || []).length === 1 ? '' : 's'}{p.is_default ? ' · default' : ''}</small></span>
              <span className="pk-item-price">{money(p.base_price)}</span>
            </button>
          ))}
          {pkgs.length < 3 && (
            <button type="button" className="pk-item pk-add" onClick={async () => { if (await leaveOk()) { dirty.current = false; onAdd(); } }}>
              <Icon d={PLUS} />Add a package
            </button>
          )}
        </div>
        {sel
          ? <PkgEditor key={sel.id} pkg={sel} folder={tpl.name} onSaved={onSaved} onDelete={() => onDelete(sel.id)}
              onDirty={v => { dirty.current = v; }} />
          : <div className="pk-card pk-empty">No packages in this folder yet. Add the first one on the left.</div>}
      </div>
    </div>
  );
}

function PkgEditor({ pkg, folder, onSaved, onDelete, onDirty }) {
  const [f, setF] = useState(() => formOf(pkg));
  const [newInc, setNewInc] = useState('');
  const [state, setState] = useState('');      // '' | 'saved' | error text
  const [drag, setDrag] = useState(null);       // the item being moved
  const set = (k, v) => { setF(s => ({ ...s, [k]: v })); setState(''); };
  const isDirty = JSON.stringify(f) !== JSON.stringify(formOf(pkg));
  useEffect(() => { onDirty(isDirty); }, [isDirty, onDirty]);

  async function save() {
    try {
      await api.updateVendorPackage(pkg.id, {
        ...f, base_price: Number(f.base_price) || 0,
        included_hours: Number(f.included_hours) || 0,
        per_hour_price: Number(f.per_hour_price) || 0,
      });
      setState('saved');
      onSaved && onSaved();
    } catch (e) { setState(e.message); }
  }
  function addInc() {
    if (!newInc.trim()) return;
    set('inclusions', [...f.inclusions, newInc.trim()]);
    setNewInc('');
  }
  const rmInc = (i) => set('inclusions', f.inclusions.filter((_, x) => x !== i));
  function moveTo(i) {
    if (drag === null || drag === i) return;
    const next = [...f.inclusions];
    const [item] = next.splice(drag, 1);
    next.splice(i, 0, item);
    set('inclusions', next);
    setDrag(i);
  }
  const hours = Number(f.included_hours) || 0, extra = Number(f.per_hour_price) || 0;

  return (
    <>
      <div className="pk-card pk-edit">
        <div className="pk-head">
          <h3>{f.name || 'Untitled package'}</h3>
          {pkg.is_default ? <span className="badge active">Default</span>
            : <button type="button" className="pk-link" onClick={onDelete}>Delete package</button>}
        </div>
        <div className="pk-form">
          <label className="pk-field"><span>Package name</span>
            <input value={f.name} onChange={e => set('name', e.target.value)} /></label>
          <div className="pk-row3">
            <label className="pk-field"><span>Price</span>
              <span className="pk-money"><em>{moneySymbol()}</em><input type="number" value={f.base_price} onChange={e => set('base_price', e.target.value)} /></span></label>
            <label className="pk-field"><span>Hours included</span>
              <input type="number" value={f.included_hours} onChange={e => set('included_hours', e.target.value)} /></label>
            <label className="pk-field"><span>Extra hour</span>
              <span className="pk-money"><em>{moneySymbol()}</em><input type="number" value={f.per_hour_price} onChange={e => set('per_hour_price', e.target.value)} /></span></label>
          </div>
          <div className="pk-field"><span>What’s included</span>
            <ul className="pk-incs">
              {f.inclusions.map((inc, i) => (
                <li key={`${i}-${inc}`} draggable className={`pk-inc ${drag === i ? 'is-drag' : ''}`}
                  onDragStart={() => setDrag(i)} onDragEnter={() => moveTo(i)} onDragOver={e => e.preventDefault()} onDragEnd={() => setDrag(null)}>
                  <Icon d={GRIP} className="pk-ic pk-grip" />
                  <span className="pk-inc-text">{inc}</span>
                  <button type="button" className="pk-x" title="Remove" onClick={() => rmInc(i)}><Icon d={CROSS} /></button>
                </li>
              ))}
            </ul>
            {f.inclusions.length === 0 && <p className="pk-faint">Nothing listed yet. Add what your clients get with this package.</p>}
            <div className="pk-add-row">
              <input placeholder="Add an item, then press Enter" value={newInc}
                onChange={e => setNewInc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addInc()} />
              <button type="button" className="refresh" onClick={addInc}><Icon d={PLUS} />Add</button>
            </div>
          </div>
        </div>
        <div className="pk-foot">
          <span className={`pk-status ${state && state !== 'saved' ? 'is-err' : ''}`}>
            {state && state !== 'saved' ? state : isDirty ? 'Unsaved changes' : state === 'saved' ? 'Saved' : 'All changes saved'}
          </span>
          <span className="pk-foot-btns">
            {isDirty && <button type="button" className="refresh" onClick={() => { setF(formOf(pkg)); setState(''); }}>Discard</button>}
            <button type="button" className="refresh pk-save" disabled={!isDirty} onClick={save}>Save changes</button>
          </span>
        </div>
      </div>

      <div className="pk-card pk-preview">
        <div className="pk-tag">What your client sees</div>
        <h4>{f.name || 'Untitled package'}</h4>
        <div className="pk-faint">{folder}</div>
        <div className="pk-price">{money(f.base_price)}</div>
        {(hours > 0 || extra > 0) && (
          <div className="pk-hours">{hours > 0 && `${hours} hours included`}{hours > 0 && extra > 0 && ' · '}{extra > 0 && `${money(extra)} per extra hour`}</div>
        )}
        <ul>
          {f.inclusions.map((inc, i) => <li key={i}><Icon d={CHECK} />{inc}</li>)}
        </ul>
      </div>
    </>
  );
}
