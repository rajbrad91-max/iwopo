/**
 * 📦 One of a lead's packages on the lead page (Raj, 2026-11-13): what THIS client would pay for it — the package,
 * any hours beyond those it covers, and the extras — and, unlocked, an editor for this client's copy.
 * The price is worked out by lib/packageQuote.js, the same function the server charges by.
 */
import { useState } from 'react';
import { fmtMoney, moneySymbol } from '../../lib/api';
import { quotePackage, EXTRA_UNITS, EXTRA_MODES, unitText, newExtraId, hoursBetween, taxOf } from '../../lib/packageQuote';

const MODE_TAG = { added: 'ADDED', included: 'INCLUDED' };
const qtyUnit = (u) => u === 'per_item' || u === 'per_hour';

/** the line an extra gets on the quote: "Drone", "Prints × 3", "Welcome drinks × 150 guests" */
function lineLabel(l) {
  if (l.unit === 'per_guest') return `${l.name} × ${l.qty} guests`;
  if (l.unit === 'per_hour') return `${l.name} × ${l.qty} hr`;
  return l.qty > 1 ? `${l.name} × ${l.qty}` : l.name;
}

/** pre-events with a start and end time, as extras priced at this package's extra-hour rate */
export function preEventExtras(lead, pkg) {
  const rate = Number(pkg.per_hour_price) || 0;
  const have = new Set((pkg.extras || []).filter(x => x.source === 'pre_event').map(x => x.name));
  return (Array.isArray(lead.pre_events) ? lead.pre_events : [])
    .map((e, i) => ({ e, i, hrs: hoursBetween(e.from, e.to) }))
    .filter(({ e, hrs }) => e?.name && hrs > 0)
    .map(({ e, i, hrs }) => ({
      id: `pe${i}${String(e.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`,
      name: `${e.name} — ${hrs} hr coverage`.slice(0, 80),
      description: [e.date, e.from && e.to ? `${e.from}–${e.to}` : '', e.location].filter(Boolean).join(' · ').slice(0, 160),
      price: Math.round(hrs * rate * 100) / 100, unit: 'once', max_qty: null,
      mode: 'added', chosen: false, qty: 1, source: 'pre_event',
    }))
    .filter(x => !have.has(x.name));
}

export function LeadPkgRow({ pkg: p, lead, locked, onEdit, onRemove, onSave }) {
  const q = quotePackage(p, lead);
  const extras = (Array.isArray(p.extras) ? p.extras : []).filter(x => x.mode !== 'off');
  const priced = new Set(q.extras.map(l => l.id));
  const others = extras.filter(x => !priced.has(x.id));          // included, or offered and not taken
  const asked = Number(lead.hours) || 0;
  const pre = locked ? [] : preEventExtras(lead, p);
  const showQuote = q.extra_hours > 0 || q.extras.length > 0 || q.price_mode === 'per_guest';

  // ⏱ said only when hours were actually added to the price (older offers that still price by the hour)
  const hoursNote = q.extra_hours > 0 ? `${q.included_hours} hrs included · client asked for ${asked} → +${q.extra_hours} hr added` : '';

  return (
    <div className={`ld-pkg ${p.is_selected ? 'is-chosen' : ''}`}>
      <div className="ld-pkg-head">
        <span className="ld-pkg-name">{p.name}</span>
        {p.is_selected && <span className="ld-pkg-picked">✓ client picked this</span>}
        <span className="ld-pkg-amt">{fmtMoney(q.total)}</span>
      </div>
      {p.description && <div className="ld-pkg-desc">{p.description}</div>}
      {taxOf(p.tax_mode, p.tax_rate, q.total, fmtMoney).text && <div className="ld-pkg-desc">🧾 {taxOf(p.tax_mode, p.tax_rate, q.total, fmtMoney).text}</div>}
      {hoursNote && <div className="ld-pkg-hrs">⏱ {hoursNote}</div>}

      {/* 🧾 how the figure is made up, when it is more than one price */}
      {showQuote && (
        <div className="ld-pkg-quote">
          <div><span>{q.price_mode === 'per_guest' ? `Package · ${q.guests} guests × ${fmtMoney(q.price)}` : 'Package'}</span><b>{fmtMoney(q.base)}</b></div>
          {q.extra_hours > 0 && <div><span>{q.extra_hours} extra hr × {fmtMoney(q.extra_hour_price)}</span><b>{fmtMoney(q.extra_hours_amount)}</b></div>}
          {q.extras.map(l => (
            <div key={l.id}><span>{lineLabel(l)} <em className={`ld-xtag ${l.mode === 'optional' ? 'is-client' : ''}`}>{l.mode === 'optional' ? 'CLIENT ADDED' : 'ADDED'}</em></span><b>{fmtMoney(l.amount)}</b></div>
          ))}
        </div>
      )}

      {(p.inclusions || []).length > 0 && (
        <ul className="ld-pkg-incl">
          {p.inclusions.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}

      {others.length > 0 && (
        <ul className="ld-pkg-xs">
          {others.map(x => (
            <li key={x.id}>
              <span>{x.name}</span>
              {x.mode === 'included'
                ? <em className="ld-xtag is-incl">{MODE_TAG.included}</em>
                : <em className="ld-xtag is-offer">client can add · +{unitText(x.unit, fmtMoney(x.price))}</em>}
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <div className="ld-pkg-acts">
          <button type="button" onClick={onEdit}>✏️ Edit</button>
          {pre.length > 0 && (
            <button type="button" title="Each pre-event's hours at this package's extra-hour price — edit them after"
              onClick={() => onSave({ extras: [...(p.extras || []), ...pre] })}>➕ Pre-events as extras ({pre.length})</button>
          )}
          <button type="button" className="is-danger" onClick={onRemove}>🗑️ Remove</button>
        </div>
      )}
    </div>
  );
}

const blankExtra = () => ({ id: newExtraId(), name: '', description: '', price: '', unit: 'once', max_qty: null, mode: 'added', chosen: false, qty: 1, source: 'custom' });

/** ✏️ This client's copy of a package — never the vendor's master list. */
export function PackageEditor({ pkg, onSave, onCancel }) {
  const [f, setF] = useState(() => ({
    name: pkg.name,
    price: String(pkg.price ?? 0),
    description: pkg.description || '',
    items: (pkg.inclusions || []).join('\n'),
    extras: (Array.isArray(pkg.extras) ? pkg.extras : []).map(x => ({ ...x, price: x.price ?? '' })),
  }));
  const [err, setErr] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const setX = (i, k, v) => setF(s => ({ ...s, extras: s.extras.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));

  function save() {
    if (f.extras.some(x => !String(x.name).trim())) { setErr('Give every extra a name, or remove the empty one.'); return; }
    onSave({
      name: f.name,
      price: Number(f.price) || 0,
      description: f.description,
      inclusions: f.items.split('\n').map(s => s.trim()).filter(Boolean),
      extras: f.extras.map(x => {
        const qty = Math.max(Number(x.qty) || 1, 1);
        // a quantity the vendor sets is never cut down by the limit meant for the client
        return { ...x, name: String(x.name).trim(), price: Number(x.price) || 0, qty, max_qty: qtyUnit(x.unit) ? Math.max(Number(x.max_qty) || 10, qty) : null };
      }),
    });
  }

  return (
    <div className="ld-pkg-edit">
      <label className="fb-label">Package name</label>
      <input className="fb-select" value={f.name} onChange={e => set('name', e.target.value)} />

      <label className="fb-label">Short line under the name</label>
      <input className="fb-select" maxLength={300} value={f.description} onChange={e => set('description', e.target.value)} />

      <label className="fb-label">Price for this client ({moneySymbol()})</label>
      <input className="fb-select" type="number" min="0" step="1" value={f.price} onChange={e => set('price', e.target.value)} />

      <label className="fb-label">What&apos;s included — one per line</label>
      <textarea className="fb-select ld-pkg-ta" rows="5" value={f.items} onChange={e => set('items', e.target.value)} />

      <label className="fb-label">Extras for this client</label>
      {f.extras.length === 0 && <p className="ld-pkg-empty">No extras on this package.</p>}
      {f.extras.map((x, i) => (
        <div key={x.id} className="ld-x-row">
          <input className="fb-select ld-x-name" placeholder="Extra" maxLength={80} value={x.name} onChange={e => setX(i, 'name', e.target.value)} />
          <input className="fb-select ld-x-price" type="number" min="0" placeholder={moneySymbol()} value={x.price} onChange={e => setX(i, 'price', e.target.value)} />
          <select className="fb-select ld-x-unit" value={x.unit} onChange={e => setX(i, 'unit', e.target.value)}>
            {EXTRA_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="fb-select ld-x-mode" value={x.mode} onChange={e => setX(i, 'mode', e.target.value)}>
            {EXTRA_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {qtyUnit(x.unit) && x.mode === 'added' && (
            <input className="fb-select ld-x-qty" type="number" min="1" max="99" title="How many" value={x.qty} onChange={e => setX(i, 'qty', e.target.value)} />
          )}
          {qtyUnit(x.unit) && x.mode === 'optional' && (
            <input className="fb-select ld-x-qty" type="number" min="1" max="99" title="Most the client can add" value={x.max_qty || 10} onChange={e => setX(i, 'max_qty', e.target.value)} />
          )}
          <button type="button" className="ld-x-del" title="Remove" onClick={() => setF(s => ({ ...s, extras: s.extras.filter((_, j) => j !== i) }))}>✕</button>
          {x.mode === 'optional' && x.chosen && (
            <span className="ld-xtag is-client ld-x-note">client added this{qtyUnit(x.unit) ? ` · ${x.qty}${x.unit === 'per_hour' ? ' hr' : ''}` : ''}</span>
          )}
        </div>
      ))}
      {f.extras.length < 20 && (
        <button type="button" className="ld-x-add" onClick={() => setF(s => ({ ...s, extras: [...s.extras, blankExtra()] }))}>+ Add an extra for this client</button>
      )}

      {err && <div className="ld-msg is-err ld-msg-mt">{err}</div>}
      <div className="ld-pkg-acts">
        <button type="button" className="is-primary" onClick={save}>✓ Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
