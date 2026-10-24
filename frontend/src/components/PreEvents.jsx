import { useState } from 'react';
import { api } from '../lib/api';
import './preevents.css';

/**
 * 🗓️ Pre-events on a lead (Raj, 2026-10-24): Mehndi, Jaggo, Sangeet, Reception… — each with its own date, time,
 * place, guests and service. They print in the contract's schedule under a gold "Pre-Events" heading.
 */
const BLANK = { name: '', date: '', from: '', to: '', location: '', guests: '', service: '' };

export default function PreEvents({ lead, onSaved }) {
  const [list, setList] = useState(() => (Array.isArray(lead.pre_events) ? lead.pre_events : []).map(e => ({ ...BLANK, ...e })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const change = (i, k, v) => { setList(l => l.map((e, j) => (j === i ? { ...e, [k]: v } : e))); setDirty(true); setMsg(''); };
  const add = () => { setList(l => [...l, { ...BLANK }]); setDirty(true); };
  const remove = (i) => { setList(l => l.filter((_, j) => j !== i)); setDirty(true); };
  async function save() {
    setBusy(true); setMsg('');
    try {
      const d = await api.updateLead(lead.id, { pre_events: list.filter(e => e.name.trim()) });
      const saved = Array.isArray(d.lead?.pre_events) ? d.lead.pre_events : [];
      setList(saved.map(e => ({ ...BLANK, ...e }))); setDirty(false); setMsg('✅ Saved');
      if (onSaved && d.lead) onSaved(d.lead);
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="ld-card">
      <div className="ld-card-h">🗓️ Pre-Events</div>
      {list.length === 0 && <p className="pe-empty">Mehndi, Jaggo, Sangeet, Reception… add them here and they appear in the contract's schedule.</p>}
      {list.map((e, i) => (
        <div className="pe-row" key={i}>
          <div className="pe-grid">
            <label className="pe-f pe-wide"><span>Name</span><input value={e.name} placeholder="Mehndi" onChange={x => change(i, 'name', x.target.value)} /></label>
            <label className="pe-f"><span>Date</span><input type="date" value={e.date} onChange={x => change(i, 'date', x.target.value)} /></label>
            <label className="pe-f"><span>From</span><input type="time" value={e.from} onChange={x => change(i, 'from', x.target.value)} /></label>
            <label className="pe-f"><span>To</span><input type="time" value={e.to} onChange={x => change(i, 'to', x.target.value)} /></label>
            <label className="pe-f pe-wide"><span>Location</span><input value={e.location} placeholder="Venue or address" onChange={x => change(i, 'location', x.target.value)} /></label>
            <label className="pe-f"><span>Est guests</span><input type="number" min="0" value={e.guests} onChange={x => change(i, 'guests', x.target.value)} /></label>
            <label className="pe-f"><span>Service</span><input value={e.service} placeholder="Photos & Videos" onChange={x => change(i, 'service', x.target.value)} /></label>
          </div>
          <button type="button" className="pe-remove" onClick={() => remove(i)} aria-label={`Remove ${e.name || 'this pre-event'}`}>🗑️</button>
        </div>
      ))}
      <div className="pe-actions">
        <button type="button" className="refresh" onClick={add}>＋ Add pre-event</button>
        {dirty && <button type="button" className="refresh pe-save" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save pre-events'}</button>}
        {msg && <span className="pe-msg">{msg}</span>}
      </div>
    </div>
  );
}
