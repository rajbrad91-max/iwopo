import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';
import './ppmboard.css';

const ProjectStages = lazy(() => import('./ProjectStages.jsx'));

/**
 * 📋 PPM Board (Raj, 2026-10-23) — the owner's production tracker, inside AI Agent (not on the lead page).
 * Same records Gale and the PPM board read and write (iwopo is the single source of truth):
 *  - a tick is saved, and the row is replaced by what the server confirms; a failed save puts it back, with a message
 *  - the list re-reads itself every 15 seconds and whenever the page comes back into view, so changes made
 *    by Gale or on the board show up here without a reload
 */
const STEPS = [['backed_up_at', '💾', 'Backed up'], ['sent_to_editor_at', '✂️', 'Sent to editor'], ['editing_photos_done_at', '🖼️', 'Photos edited'], ['editing_videos_done_at', '🎬', 'Videos edited']];
const today = () => new Date().toISOString().slice(0, 10);
const nice = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const doneAll = (b) => STEPS.every(([k]) => b[k]);

export default function PpmBoard() {
  const dialog = useDialog();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [show, setShow] = useState(() => localStorage.getItem('ppm_show') || 'open');   // 'open' | 'all'
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);         // the booking whose full card is open
  const [busy, setBusy] = useState({});           // `${lead}:${step}` → saving
  const [at, setAt] = useState(null);             // when the list was last read
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  const load = useCallback(async () => {
    try {
      const d = await api.agentStagesList();
      // a tick still being saved keeps its on-screen state until the server answers
      setRows(prev => (d.bookings || []).map(b => {
        const mine = prev?.find(p => p.lead_id === b.lead_id);
        if (!mine) return b;
        const keep = {}; for (const [k] of STEPS) if (busyRef.current[`${b.lead_id}:${k}`]) keep[k] = mine[k];
        return { ...b, ...keep };
      }));
      setAt(new Date()); setErr('');
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    const back = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [load]);

  async function tick(b, k, label) {
    const on = !b[k];
    if (!on && !await dialog.confirm(`"${label}" will be marked not done for ${b.client}.`, { title: 'Untick this step?', okLabel: 'Untick' })) return;
    const key = `${b.lead_id}:${k}`;
    const before = b[k];
    setBusy(x => ({ ...x, [key]: true }));
    setRows(rs => rs.map(r => (r.lead_id === b.lead_id ? { ...r, [k]: on ? today() : null } : r)));
    try {
      const saved = await api.agentSetStages(b.lead_id, { [k]: on ? today() : null });
      setRows(rs => rs.map(r => (r.lead_id === b.lead_id ? { ...r, ...pick(saved) } : r)));
      setErr('');
    } catch (e) {
      setRows(rs => rs.map(r => (r.lead_id === b.lead_id ? { ...r, [k]: before } : r)));
      setErr(`⚠️ Not saved (${b.client}, ${label}): ${e.message}`);
    } finally { setBusy(x => { const n = { ...x }; delete n[key]; return n; }); }
  }

  if (rows === null) return <p className="ppm-quiet">{err || 'Loading…'}</p>;
  const term = q.trim().toLowerCase();
  const shown = rows.filter(b => (show === 'all' || !doneAll(b)) && (!term || `${b.client} ${b.event_type || ''} ${b.shoot_date || ''}`.toLowerCase().includes(term)));

  return (
    <div className="ppm">
      <div className="ppm-bar">
        <input className="ppm-search" type="search" placeholder="Search a client" value={q} onChange={e => setQ(e.target.value)} aria-label="Search a client" />
        <div className="ppm-seg" role="tablist">
          {[['open', 'Not finished'], ['all', 'All']].map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={show === v} className={`ppm-seg-b ${show === v ? 'is-on' : ''}`}
              onClick={() => { setShow(v); localStorage.setItem('ppm_show', v); }}>{l}</button>
          ))}
        </div>
        <button type="button" className="ppm-refresh" onClick={load} title="Read the latest now">↻</button>
        {at && <span className="ppm-at">Updated {at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>}
      </div>
      {err && <p className="ppm-err" role="alert">{err}</p>}

      {shown.length === 0 ? <p className="ppm-quiet">{term ? `No booking matches "${q}".` : show === 'open' ? 'Every booking is finished 🎉' : 'No bookings yet.'}</p> : (
        <ul className="ppm-list">
          {shown.map(b => (
            <li key={b.lead_id} className={`ppm-row ${doneAll(b) ? 'is-done' : ''}`}>
              <button type="button" className="ppm-who" onClick={() => { setOpen(o => (o === b.lead_id ? null : b.lead_id)); if (open === b.lead_id) load(); }} aria-expanded={open === b.lead_id}>
                <b>{b.client}</b>
                <span>{[b.event_type, nice(b.shoot_date)].filter(Boolean).join(' · ')}</span>
              </button>
              <div className="ppm-steps">
                {STEPS.map(([k, ic, label]) => (
                  <button key={k} type="button" className={`ppm-step ${b[k] ? 'is-done' : 'is-todo'} ${busy[`${b.lead_id}:${k}`] ? 'is-busy' : ''}`}
                    onClick={() => tick(b, k, label)} disabled={!!busy[`${b.lead_id}:${k}`]}
                    title={b[k] ? `${label} — ${nice(b[k])}${k === 'backed_up_at' && b.backed_up_by ? ` · by ${b.backed_up_by}` : ''}` : `${label} — not yet (tap when done)`}>
                    <span aria-hidden="true">{ic}</span><span className="ppm-step-t">{label}</span>
                  </button>
                ))}
              </div>
              {open === b.lead_id && (
                <div className="ppm-detail">
                  <Suspense fallback={<p className="ppm-quiet">Loading…</p>}><ProjectStages leadId={b.lead_id} /></Suspense>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pick(saved) {
  const o = {}; for (const [k] of STEPS) o[k] = saved?.[k] ?? null;
  if (saved && 'backed_up_by' in saved) o.backed_up_by = saved.backed_up_by;
  return o;
}
