import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import './ppmBoard.css';

/**
 * 📊 The PPM Board — every booking and where it stands, for Perfect Poses Media's own use (Raj, 2026-11-07).
 * The same facts as the desktop board and Gale (lib/projectStages.js via /api/agent/stages — the AI Agent
 * feature, which only the owner's account has): booked → the wedding date → backed up →
 * sent to editor → editing (photos, videos) → delivered → review asked → download reminder. Nothing is guessed:
 * a stage is done only when it has a date. Click a stage to set or clear it; it re-reads every minute.
 */
const TZ = 'America/Vancouver';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const ymd = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }) : null);
function short(d) {
  if (!d) return '';
  const x = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : d);
  const sameYear = x.getFullYear() === new Date().getFullYear();
  return x.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const STAGES = [
  ['backed_up_at', '💾 Copied'],
  ['sent_to_editor_at', '✂️ To editor'],
  ['editing', '🎨 Edited'],
  ['delivered_at', '📦 Delivered'],
  ['review_asked_at', '⭐ Review'],
  ['download_reminder_at', '⏰ Reminder'],
];

/** where a booking stands — for sorting and the Active filter */
function standing(b) {
  const t = today();
  const due = ymd(b.delivery_due_at);
  const overdue = !!(!b.delivered && due && due < t);
  const finished = b.delivered && b.review_asked_at && b.download_reminder_at;
  const lastShoot = b.shoot_date || '';
  return { overdue, finished, due, lastShoot };
}

export default function PpmBoard() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState('active');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);        // { lead, field, label }
  const [open, setOpen] = useState(null);        // lead id whose log is open
  const [log, setLog] = useState(null);

  const load = useCallback(() => api.ppmBoard().then(d => { setRows(d.bookings || []); setErr(''); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows
      .map(b => ({ b, s: standing(b) }))
      .filter(({ b, s }) => (view === 'all' || !s.finished) && (!needle || `${b.client} ${b.event_type || ''}`.toLowerCase().includes(needle)))
      .sort((x, y) => (y.s.overdue - x.s.overdue)
        || String(x.s.due || '9999').localeCompare(String(y.s.due || '9999'))
        || String(x.s.lastShoot).localeCompare(String(y.s.lastShoot)));
  }, [rows, view, q]);

  async function save(leadId, field, value) {
    try {
      const updated = await api.ppmSet(leadId, { [field]: value });
      setRows(rs => rs.map(r => (r.lead_id === leadId ? { ...r, ...stripLog(updated) } : r)));
      if (open === leadId) setLog(updated);
      setEdit(null);
    } catch (e) { setErr(e.message); }
  }
  async function toggleLog(leadId) {
    if (open === leadId) { setOpen(null); setLog(null); return; }
    setOpen(leadId); setLog(null);
    try { setLog(await api.ppmDetail(leadId)); } catch (e) { setErr(e.message); }
  }


  return (
    <div className="ppm">
      <div className="ppm-bar">
        <div className="ppm-views" role="tablist">
          {[['active', 'Active'], ['all', 'All']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`ppm-view${view === k ? ' is-on' : ''}`} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <input className="ppm-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a client…" />
        <span className="ppm-legend"><i className="ppm-dot is-done" /> done <i className="ppm-dot is-todo" /> not yet <i className="ppm-dot is-late" /> overdue</span>
      </div>
      {err && <div className="err-banner">⚠️ {err}</div>}

      <div className="table-wrap ppm-wrap">
        <table className="ppm-table">
          <thead>
            <tr><th>Client</th><th>📝 Booked</th><th>📸 Shoot</th>{STAGES.map(([k, l]) => <th key={k}>{l}</th>)}<th /></tr>
          </thead>
          <tbody>
            {rows === null ? <tr><td colSpan={10} className="ppm-empty">Loading…</td></tr>
              : shown.length === 0 ? <tr><td colSpan={10} className="ppm-empty">{rows.length ? 'Nothing here — try All.' : 'No bookings yet. A booking appears here as soon as it is booked.'}</td></tr>
              : shown.map(({ b, s }) => (
                <FragmentRow key={b.lead_id} open={open === b.lead_id} log={open === b.lead_id ? log : null}>
                  <tr className={s.overdue ? 'is-overdue' : ''}>
                    <td className="ppm-client">
                      <b>{b.client}</b>
                      <span className="ppm-sub">
                        {b.event_type ? `${b.event_type} · ` : ''}
                        <button type="button" className={`ppm-due${s.overdue ? ' is-late' : ''}`} onClick={() => setEdit({ lead: b, field: 'delivery_due_at', label: '📅 Delivery due' })}>
                          {s.due ? `${s.overdue ? '⚠️ ' : 'due '}${short(s.due)}` : '+ due'}
                        </button>
                      </span>
                    </td>
                    <td><span className="ppm-cell is-done is-static" title={b.booked_at ? 'Contract signed' : 'Booked'}><span className="ppm-dot" />{b.booked_at ? short(b.booked_at) : '✓'}</span></td>
                    <td className="ppm-shoot">   {/* the main wedding date only — green once it has passed */}
                      {b.shoot_date
                        ? <span className={`ppm-ev ${b.shoot_date < today() ? 'is-done' : 'is-up'}`}><span className="ppm-dot" />{short(b.shoot_date)}</span>
                        : <span className="ppm-sub">—</span>}
                    </td>
                    <td><Stage onPick={setEdit} b={b} field="backed_up_at" label="💾 Backed up" /></td>
                    <td><Stage onPick={setEdit} b={b} field="sent_to_editor_at" label="🧑‍🎨 Sent to editor" /></td>
                    <td>
                      <div className="ppm-edit">   {/* the grid lives inside the cell, so the cell stays a table cell */}
                        <span className="ppm-sub">📷</span><Stage onPick={setEdit} b={b} field="editing_photos_done_at" label="📷 Photos edited" small />
                        <span className="ppm-sub">🎥</span><Stage onPick={setEdit} b={b} field="editing_videos_done_at" label="🎥 Videos edited" small />
                      </div>
                    </td>
                    <td><Stage onPick={setEdit} b={b} field="delivered_at" label="📦 Delivered" /></td>
                    <td><Stage onPick={setEdit} b={b} field="review_asked_at" label="⭐ Review asked" /></td>
                    <td><Stage onPick={setEdit} b={b} field="download_reminder_at" label="⏰ Download reminder" /></td>
                    <td><button type="button" className="ppm-log-btn" onClick={() => toggleLog(b.lead_id)} aria-expanded={open === b.lead_id} title={open === b.lead_id ? 'Close the log' : 'Messages and emails'}>{open === b.lead_id ? '✕' : '📜'}</button></td>
                  </tr>
                </FragmentRow>
              ))}
          </tbody>
        </table>
      </div>

      {edit && <StageEditor edit={edit} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** the row's own facts, without the log that a single-booking read also returns */
const stripLog = (x) => { const r = { ...x }; delete r.outside_messages; delete r.emails; return r; };

/** one stage: green with its date when done, orange "not yet" (or when it is due) when not; click to set it */
function Stage({ b, field, label, small, onPick }) {
  const at = b[field];
  const done = !!at || (field === 'delivered_at' && b.delivered);
  const reminderDue = field === 'download_reminder_at' && !at && b.delivered_at ? short(addDays(b.delivered_at, 21)) : null;
  return (
    <button type="button" className={`ppm-cell ${done ? 'is-done' : 'is-todo'}${small ? ' is-small' : ''}`} onClick={() => onPick({ lead: b, field, label })}
      title={done ? `${label}: ${at ? short(at) : 'yes'} — click to change` : `${label}: not yet — click to set`}>
      <span className="ppm-dot" />{done ? (at ? short(at) : '✓') : reminderDue ? `due ${reminderDue}` : <span className="ppm-sr">not yet</span>}
    </button>
  );
}

/** a row, and under it (when open) the booking's log: messages sent outside iwopo and the emails iwopo sent */
function FragmentRow({ children, open, log }) {
  return (
    <>
      {children}
      {open && (
        <tr className="ppm-log"><td colSpan={10}>
          {!log ? 'Loading…' : (
            <div className="ppm-log-in">
              <div><b>Messages outside iwopo</b>{log.outside_messages.length === 0 ? <p className="ppm-sub">None recorded.</p>
                : <ul>{log.outside_messages.map(m => <li key={m.id}><span className="ppm-sub">{short(m.sent_at)} · {m.channel}{m.direction === 'in' ? ' (from them)' : ''}</span> {m.text}</li>)}</ul>}</div>
              <div><b>Emails iwopo sent</b>{log.emails.length === 0 ? <p className="ppm-sub">None yet.</p>
                : <ul>{log.emails.map(m => <li key={m.id}><span className="ppm-sub">{short(m.sent_at)}</span> {m.subject}{!m.ok && <em className="ppm-fail"> · failed</em>}</li>)}</ul>}</div>
            </div>
          )}
        </td></tr>
      )}
    </>
  );
}

/** set a stage: today, a chosen date, or clear it */
function StageEditor({ edit, onSave, onClose }) {
  const { lead, field, label } = edit;
  const current = lead[field] ? ymd(lead[field]) : '';
  const [date, setDate] = useState(current || today());
  return (
    <div className="ppm-pop-back" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="ppm-pop" onClick={e => e.stopPropagation()}>
        <h3>{label}</h3>
        <p className="ppm-sub">{lead.client}{lead.event_type ? ` · ${lead.event_type}` : ''}</p>
        <button type="button" className="ppm-pop-main" onClick={() => onSave(lead.lead_id, field, 'now')}>✓ {field === 'delivery_due_at' ? 'Due today' : 'Done today'}</button>
        <label className="ppm-pop-lbl" htmlFor="ppm-date">Or pick a date</label>
        <div className="ppm-pop-row">
          <input id="ppm-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button type="button" className="ppm-pop-set" disabled={!date} onClick={() => onSave(lead.lead_id, field, date)}>Set</button>
        </div>
        <div className="ppm-pop-foot">
          {(current || (field === 'delivered_at' && lead.delivered)) && <button type="button" className="ppm-pop-clear" onClick={() => onSave(lead.lead_id, field, null)}>Clear</button>}
          <button type="button" className="ppm-pop-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
