/**
 * 📦 My Packages: package templates and their cards.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef } from 'react';
import { useDialog } from '../../lib/dialog.jsx';
import { api, moneySymbol, fmtMoney } from '../../lib/api';
import { EXTRA_UNITS, newExtraId, TAX_MODES, taxOf } from '../../lib/packageQuote';

export function PackagesView() {
  const dialog = useDialog();
  const [tpls, setTpls] = useState([]);
  const [selTpl, setSelTpl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, []);
  // 🔤 the contract's fonts — Lora and Open Sans (pages/contractdoc-doc.css) — so packages read like the agreement they become
  useEffect(() => {
    const href = 'https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Open+Sans:wght@400;600;700&display=swap';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }, []);
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

  // only the first load blanks the page — a reload after a save keeps the folder on screen (and its "✓ Saved")
  if (loading && !tpls.length) return <div className="loading">Loading…</div>;

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
const PLUS = 'M12 5v14M5 12h14';

const folderExtrasOf = (tpl) => (Array.isArray(tpl?.extras) ? tpl.extras : []);
const formOf = (pkg) => ({
  name: pkg.name || '',
  description: pkg.description || '',
  base_price: pkg.base_price ?? '',
  inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions : [],
});
const extraRow = (x) => ({ id: x.id, name: x.name || '', description: x.description || '', price: x.price ?? '', unit: x.unit || 'once', max_qty: x.max_qty ?? null });
const stateOf = (pkg, id) => pkg.extras_state?.[id] || 'offered';
const STATE_WORD = { offered: 'Add-on', included: 'Included', hidden: 'Not offered' };
const UNIT_WORD = { once: '', per_item: ' each', per_hour: ' per hour', per_guest: ' per guest' };

/**
 * 📦 Inside a folder (Raj, 2026-11-13): its three packages side by side, each edited right on its card — name, price
 * and what's included — then the folder's extras, with a column per package saying whether that package offers it as
 * an add-on, includes it, or leaves it out, and last how the client will see them. One Save for the lot.
 * The price is the price: the client's details (hours, people, guests) reach the vendor before they quote, so there
 * is no per-guest or per-hour arithmetic here — anything a package provides is a line in it.
 */
function PackagesFolder({ tpl, msg, onBack, onAdd, onDelete, onSaved }) {
  const pkgs = tpl.packages;
  // "✓ Saved" lives here: the board below starts over from what is saved each time a save reloads the folder
  const [justSaved, setJustSaved] = useState(false);
  // remounted whenever the saved folder changes, so what is on screen always starts from what is saved
  const key = `${tpl.id}|${pkgs.map(p => `${p.id}:${p.updated_at}`).join(',')}|${JSON.stringify(tpl.extras || [])}|${tpl.tax_mode}|${tpl.tax_rate}`;
  return <PackagesBoard key={key} tpl={tpl} msg={msg} onBack={onBack} onAdd={onAdd} onDelete={onDelete}
    justSaved={justSaved} onSaved={() => { setJustSaved(true); onSaved && onSaved(); }} />;
}

function PackagesBoard({ tpl, msg, onBack, onAdd, onDelete, onSaved, justSaved }) {
  const dialog = useDialog();
  const pkgs = tpl.packages;
  const saved = useRef({
    forms: Object.fromEntries(pkgs.map(p => [p.id, formOf(p)])),
    extras: folderExtrasOf(tpl).map(extraRow),
    states: Object.fromEntries(pkgs.map(p => [p.id, Object.fromEntries(folderExtrasOf(tpl).map(x => [x.id, stateOf(p, x.id)]))])),
    tax: { mode: tpl.tax_mode || 'none', rate: tpl.tax_rate == null ? '' : String(Number(tpl.tax_rate)) },
  });
  const [forms, setForms] = useState(saved.current.forms);
  const [extras, setExtras] = useState(saved.current.extras);
  const [states, setStates] = useState(saved.current.states);
  const [tax, setTax] = useState(saved.current.tax);   // 🧾 tax included (%), plus tax, or not mentioned
  const [drag, setDrag] = useState(null);          // { pkg, i } — the line being moved
  const [newLine, setNewLine] = useState({});      // the "add a line" box on each card
  const [status, setStatus] = useState('');        // '' | 'saving' | 'saved' | error text

  const formDirty = (id) => JSON.stringify(forms[id]) !== JSON.stringify(saved.current.forms[id]);
  const stateDirty = (id) => JSON.stringify(states[id]) !== JSON.stringify(saved.current.states[id]);
  const extrasDirty = JSON.stringify(extras) !== JSON.stringify(saved.current.extras);
  const taxDirty = JSON.stringify(tax) !== JSON.stringify(saved.current.tax);
  const dirty = extrasDirty || taxDirty || pkgs.some(p => formDirty(p.id) || stateDirty(p.id));

  const setF = (id, k, v) => { setForms(s => ({ ...s, [id]: { ...s[id], [k]: v } })); setStatus(''); };
  const setLines = (id, lines) => setF(id, 'inclusions', lines);
  function addLine(id) {
    const t = String(newLine[id] || '').trim();
    if (!t) return;
    setLines(id, [...forms[id].inclusions, t]);
    setNewLine(s => ({ ...s, [id]: '' }));
  }
  function moveTo(id, i) {
    if (!drag || drag.pkg !== id || drag.i === i) return;
    const next = [...forms[id].inclusions];
    const [item] = next.splice(drag.i, 1);
    next.splice(i, 0, item);
    setLines(id, next);
    setDrag({ pkg: id, i });
  }
  const setX = (i, k, v) => { setExtras(xs => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setStatus(''); };
  function addExtra() {
    const x = extraRow({ id: newExtraId(), name: '', price: '', unit: 'once' });
    setExtras(xs => [...xs, x]);
    setStates(s => Object.fromEntries(pkgs.map(p => [p.id, { ...s[p.id], [x.id]: 'offered' }])));
    setStatus('');
  }
  const removeExtra = (i) => { setExtras(xs => xs.filter((_, j) => j !== i)); setStatus(''); };
  const setState = (pid, xid, v) => { setStates(s => ({ ...s, [pid]: { ...s[pid], [xid]: v } })); setStatus(''); };

  async function saveAll() {
    if (extras.some(x => !x.name.trim())) { setStatus('Give every extra a name, or remove the empty one.'); return; }
    if (tax.mode === 'included' && !(Number(tax.rate) > 0)) { setStatus('Type the tax % your prices include.'); return; }
    setStatus('saving');
    try {
      // the folder's extras first, so each package's choices are checked against the new list
      if (extrasDirty) {
        await api.saveTemplateExtras(tpl.id, extras.map(x => ({ ...x, name: x.name.trim(), price: Number(x.price) || 0,
          max_qty: x.unit === 'per_item' || x.unit === 'per_hour' ? (x.max_qty || 10) : null })));
      }
      if (taxDirty) await api.saveTemplateTax(tpl.id, tax.mode, tax.mode === 'included' ? Number(tax.rate) : null);
      const ids = new Set(extras.map(x => x.id));
      for (const p of pkgs) {
        if (!formDirty(p.id) && !stateDirty(p.id) && !extrasDirty) continue;
        const f = forms[p.id];
        await api.updateVendorPackage(p.id, {
          name: f.name.trim() || 'Package',
          description: f.description,
          base_price: Number(f.base_price) || 0,
          // one price, nothing worked out from hours or guests (Raj, 2026-11-13)
          price_mode: 'fixed', min_guests: null, included_hours: 0, per_hour_price: 0, auto_extra_hours: false,
          inclusions: f.inclusions.map(s => s.trim()).filter(Boolean),
          extras_state: Object.fromEntries(Object.entries(states[p.id] || {}).filter(([k]) => ids.has(k))),
        });
      }
      setStatus('saved');
      onSaved && onSaved();
    } catch (e) { setStatus(e.message); }
  }
  async function leaveOk() {
    return !dirty || dialog.confirm('Your changes are not saved yet.', { title: 'Leave without saving?', okLabel: 'Leave' });
  }

  return (
    <div className="pkb-page">
      <div className="pkb-top">
        <button className="refresh" onClick={async () => { if (await leaveOk()) onBack(); }}>← All folders</button>
        <h2 className="pkb-title">📁 {tpl.name}</h2>
        <span className={`pkb-status ${status && !['saving', 'saved'].includes(status) ? 'is-err' : ''}`}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : status || (dirty ? 'Unsaved changes' : justSaved ? '✓ Saved' : '')}
        </span>
        {/* 🧾 how these prices speak about tax */}
        <select className="pkb-tax" value={tax.mode} onChange={e => { setTax(t => ({ ...t, mode: e.target.value })); setStatus(''); }}>
          {TAX_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {tax.mode === 'included' && (
          <span className="pkb-taxrate"><input type="number" min="0" max="100" step="0.01" value={tax.rate} placeholder="5"
            onChange={e => { setTax(t => ({ ...t, rate: e.target.value })); setStatus(''); }} />%</span>
        )}
        {dirty && <button className="refresh" onClick={() => { setForms(saved.current.forms); setExtras(saved.current.extras); setStates(saved.current.states); setTax(saved.current.tax); setStatus(''); }}>Discard</button>}
        <button className="refresh pkb-save" disabled={!dirty || status === 'saving'} onClick={saveAll}>Save</button>
      </div>
      {msg && <div className="err-banner">{msg}</div>}

      {/* 📦 the packages, side by side, edited where they are seen */}
      <div className="pkb-grid">
        {pkgs.map(p => {
          const f = forms[p.id];
          const lines = f.inclusions;
          return (
            <div key={p.id} className="pkb-card">
              <input className="pkb-name" value={f.name} placeholder="Package name" onChange={e => setF(p.id, 'name', e.target.value)} />
              <input className="pkb-desc" value={f.description} maxLength={300} placeholder="Short line under the name (optional)" onChange={e => setF(p.id, 'description', e.target.value)} />

              <div className="pkb-price">
                <span className="pkb-cur">{moneySymbol()}</span>
                <input className="pkb-amt" type="number" min="0" value={f.base_price} placeholder="0" onChange={e => setF(p.id, 'base_price', e.target.value)} />
              </div>

              <div className="pkb-sec">What’s included</div>
              <ul className="pkb-lines">
                {lines.map((t, i) => (
                  <li key={i} draggable className={drag?.pkg === p.id && drag.i === i ? 'is-drag' : ''}
                    onDragStart={() => setDrag({ pkg: p.id, i })} onDragEnter={() => moveTo(p.id, i)}
                    onDragOver={e => e.preventDefault()} onDragEnd={() => setDrag(null)}>
                    <Icon d={GRIP} className="pk-ic pkb-grip" />
                    <input value={t} onChange={e => setLines(p.id, lines.map((x, j) => (j === i ? e.target.value : x)))} />
                    <button type="button" className="pkb-x" title="Remove" onClick={() => setLines(p.id, lines.filter((_, j) => j !== i))}><Icon d={CROSS} /></button>
                  </li>
                ))}
              </ul>
              <div className="pkb-addline">
                <input value={newLine[p.id] || ''} placeholder="Add a line, then press Enter"
                  onChange={e => setNewLine(s => ({ ...s, [p.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addLine(p.id)} />
                <button type="button" className="pkb-x" title="Add" onClick={() => addLine(p.id)}><Icon d={PLUS} /></button>
              </div>

              {extras.some(x => states[p.id]?.[x.id] === 'included' && x.name.trim()) && (
                <div className="pkb-incx">
                  {extras.filter(x => states[p.id]?.[x.id] === 'included' && x.name.trim()).map(x => <span key={x.id}>✓ {x.name}</span>)}
                </div>
              )}

              {!p.is_default && (
                <button type="button" className="pkb-del" onClick={async () => { if (await leaveOk()) onDelete(p.id); }}>Delete package</button>
              )}
            </div>
          );
        })}
        {pkgs.length < 3 && (
          <button type="button" className="pkb-card pkb-addcard" onClick={async () => { if (await leaveOk()) onAdd(); }}>
            <Icon d={PLUS} />Add a package
          </button>
        )}
      </div>

      {/* extras — written once for the folder; a column per package */}
      <div className="pkb-xtras">
        <div className="pkb-sec pkb-xhead">Extras <small>things a client can add to a package — or that a package already includes</small></div>
        {extras.length > 0 && (
          <div className="pkb-xscroll">
            <table className="pkb-xtable">
              <thead>
                <tr>
                  <th>Extra</th><th>Price</th><th>Charged</th>
                  {pkgs.map(p => <th key={p.id}>{forms[p.id].name || 'Package'}</th>)}
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {extras.map((x, i) => (
                  <tr key={x.id}>
                    <td><input value={x.name} maxLength={80} placeholder="e.g. Drone coverage" onChange={e => setX(i, 'name', e.target.value)} /></td>
                    <td className="pkb-xprice"><span>{moneySymbol()}</span><input type="number" min="0" value={x.price} placeholder="0" onChange={e => setX(i, 'price', e.target.value)} /></td>
                    <td>
                      <select value={x.unit} onChange={e => setX(i, 'unit', e.target.value)}>
                        {EXTRA_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    {pkgs.map(p => {
                      const st = states[p.id]?.[x.id] || 'offered';
                      return (
                        <td key={p.id}>
                          <select className={`pkb-state is-${st}`} value={st} onChange={e => setState(p.id, x.id, e.target.value)}>
                            {Object.entries(STATE_WORD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                      );
                    })}
                    <td><button type="button" className="pkb-x" title="Remove this extra" onClick={() => removeExtra(i)}><Icon d={CROSS} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {extras.length < 20 && <button type="button" className="refresh pkb-addx" onClick={addExtra}><Icon d={PLUS} />Add an extra</button>}
      </div>

      {/* 👁️ what the client sees — drawn from what is on screen, saved or not */}
      {pkgs.length > 0 && (
        <div className="pkb-preview">
          <div className="pkb-sec pkb-xhead">👁️ What your client sees</div>
          <div className="pkb-pgrid">
            {pkgs.map(p => {
              const f = forms[p.id];
              const incl = extras.filter(x => x.name.trim() && states[p.id]?.[x.id] === 'included');
              const addons = extras.filter(x => x.name.trim() && (states[p.id]?.[x.id] || 'offered') === 'offered');
              return (
                <div key={p.id} className="pkb-pcard">
                  <h4>{f.name || 'Package'}</h4>
                  {f.description && <p className="pkb-pdesc">{f.description}</p>}
                  <div className="pkb-pprice">{fmtMoney(Number(f.base_price) || 0)}</div>
                  {taxOf(tax.mode, tax.rate, Number(f.base_price) || 0, fmtMoney).text && <p className="pkb-ptax">{taxOf(tax.mode, tax.rate, Number(f.base_price) || 0, fmtMoney).text}</p>}
                  <ul>
                    {f.inclusions.filter(t => t.trim()).map((t, i) => <li key={i}>✓ {t}</li>)}
                    {incl.map(x => <li key={x.id}>✓ {x.name}</li>)}
                  </ul>
                  {addons.length > 0 && (
                    <div className="pkb-padd">
                      <div className="pkb-sec">Make it yours</div>
                      {addons.map(x => (
                        <div key={x.id} className="pkb-paddrow"><span className="pkb-pbox" />{x.name}
                          <em>+{fmtMoney(Number(x.price) || 0)}{UNIT_WORD[x.unit] || ''}</em></div>
                      ))}
                    </div>
                  )}
                  <div className="pkb-pbtn">Choose {f.name || 'package'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
