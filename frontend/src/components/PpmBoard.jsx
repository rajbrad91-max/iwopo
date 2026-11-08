import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import './ppmBoard.css';

/**
 * 📊 The PPM Board — every booking and where it stands, for Perfect Poses Media's own use (Raj, 2026-11-07).
 * The same facts as the desktop board and Gale (lib/projectStages.js via /api/agent/stages — the AI Agent
 * feature, which only the owner's account has): booked → the wedding date → backed up → sent to editor →
 * editing (photos, videos) → delivered → review asked → download reminder. Nothing is guessed: a stage is done
 * only when it has a date. It re-reads every minute.
 *
 * 🛤️ Shown as a progress rail (Raj, 2026-11-08 — "at one glance"): one line per booking, eight steps on a rail —
 * green done, the next step ringed in orange and named underneath, grey not yet — and a badge saying how the
 * delivery date stands. Tap a step to set or clear it (Booked and Shoot come from the booking itself).
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
/** whole days from today to a yyyy-mm-dd day (negative = in the past) */
const daysUntil = (day) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86_400_000);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const EDITED = [['editing_photos_done_at', '📷 Photos edited'], ['editing_videos_done_at', '🎥 Videos edited']];
/* the eight steps on the rail; `field` = a step the owner sets, `edit` = the date box's title, `next` = what to do */
const STEPS = [
  { key: 'booked', label: 'Booked' },
  { key: 'shoot', label: 'Shoot' },
  { key: 'backed_up_at', label: 'Copied', field: 'backed_up_at', edit: '💾 Copied', next: 'Copy the cards' },
  { key: 'sent_to_editor_at', label: 'To editor', field: 'sent_to_editor_at', edit: '✂️ Sent to editor', next: 'Send to editor' },
  { key: 'edited', label: 'Edited', next: 'Get the edits back' },
  { key: 'delivered_at', label: 'Delivered', field: 'delivered_at', edit: '📦 Delivered', next: 'Deliver' },
  { key: 'review_asked_at', label: 'Review', field: 'review_asked_at', edit: '⭐ Review asked', next: 'Ask for a review' },
  { key: 'download_reminder_at', label: 'Reminder', field: 'download_reminder_at', edit: '⏰ Download reminder', next: 'Send the download reminder' },
];

/** each step for one booking: state 'done' | 'half' | 'todo', the day it was done, and what doing it next means */
function railOf(b) {
  const t = today();
  const steps = STEPS.map(s => {
    if (s.key === 'booked') return { ...s, state: 'done', at: b.booked_at };
    if (s.key === 'shoot') {
      const passed = !!b.shoot_date && b.shoot_date < t;
      return { ...s, state: passed ? 'done' : 'todo', at: b.shoot_date, next: b.shoot_date ? `Shoot on ${short(b.shoot_date)}` : 'Shoot' };
    }
    if (s.key === 'edited') {
      const [photos, videos] = EDITED.map(([f]) => b[f]);
      const n = (photos ? 1 : 0) + (videos ? 1 : 0);
      const next = n === 1 ? (photos ? 'Get the videos back' : 'Get the photos back') : s.next;
      return { ...s, state: n === 2 ? 'done' : n ? 'half' : 'todo', at: n === 2 ? (photos > videos ? photos : videos) : null, next };
    }
    if (s.key === 'delivered_at') return { ...s, state: b.delivered_at || b.delivered ? 'done' : 'todo', at: b.delivered_at };
    if (s.key === 'download_reminder_at' && !b[s.key] && b.delivered_at) {
      return { ...s, state: 'todo', at: null, next: `${s.next} · due ${short(addDays(b.delivered_at, 21))}` };
    }
    return { ...s, state: b[s.key] ? 'done' : 'todo', at: b[s.key] };
  });
  const next = steps.findIndex(s => s.state !== 'done');
  return { steps, next };
}

/** where a booking stands — for sorting, the Active filter and the badge */
function standing(b) {
  const due = ymd(b.delivery_due_at);
  const delivered = !!(b.delivered_at || b.delivered);
  const overdue = !!(!delivered && due && due < today());
  const finished = delivered && b.review_asked_at && b.download_reminder_at;
  return { overdue, finished, due, delivered, lastShoot: b.shoot_date || '' };
}

/** the badge on the right: delivered, late, due soon, due later — or a prompt to set the date */
function badgeOf(b, s) {
  if (s.delivered) return { kind: 'ok', text: b.delivered_at ? `Delivered ${short(b.delivered_at)}` : 'Delivered' };
  if (!s.due) return { kind: 'none', text: '+ Due date' };
  const d = daysUntil(s.due);
  if (d < 0) return { kind: 'late', text: `${plural(-d, 'day')} late` };
  if (d === 0) return { kind: 'soon', text: 'Due today' };
  if (d <= 7) return { kind: 'soon', text: `Due in ${plural(d, 'day')}` };
  return { kind: 'ok', text: d <= 30 ? `Due in ${d} days` : `Due ${short(s.due)}` };
}

export default function PpmBoard() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState('active');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);        // { lead, field, label } — or { lead, choices } for Edited
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
        <span className="ppm-legend">
          <i className="ppm-key is-done" />Done <i className="ppm-key is-next" />Next step <i className="ppm-key is-todo" />Not yet
          <i className="ppm-key is-soon" />Due soon <i className="ppm-key is-late" />Late
        </span>
      </div>
      {err && <div className="err-banner">⚠️ {err}</div>}

      <div className="ppm-list">
        <div className="ppm-head" aria-hidden="true">
          <span />
          <ol className="ppm-rail is-head">{STEPS.map(s => <li key={s.key}>{s.label}</li>)}</ol>
        </div>
        {rows === null ? <p className="ppm-empty">Loading…</p>
          : shown.length === 0 ? <p className="ppm-empty">{rows.length ? 'Nothing here — try All.' : 'No bookings yet. A booking appears here as soon as it is booked.'}</p>
          : shown.map(({ b, s }) => (
            <Booking key={b.lead_id} b={b} s={s} open={open === b.lead_id} log={open === b.lead_id ? log : null}
              onPick={setEdit} onLog={() => toggleLog(b.lead_id)} />
          ))}
      </div>

      {edit && (edit.choices
        ? <EditedChooser edit={edit} onChoose={(field, label) => setEdit({ lead: edit.lead, field, label })} onClose={() => setEdit(null)} />
        : <StageEditor edit={edit} onSave={save} onClose={() => setEdit(null)} />)}
    </div>
  );
}

/** the row's own facts, without the log that a single-booking read also returns */
const stripLog = (x) => { const r = { ...x }; delete r.outside_messages; delete r.emails; return r; };

/** one booking: who, the rail, the badge, and (when open) its log underneath */
function Booking({ b, s, open, log, onPick, onLog }) {
  const { steps, next } = railOf(b);
  const badge = badgeOf(b, s);
  const nextStep = next >= 0 ? steps[next] : null;
  return (
    <div className={`ppm-row${s.overdue ? ' is-late' : ''}${open ? ' is-open' : ''}`}>
      <div className="ppm-who">
        <b>{b.client}</b>
        <span className="ppm-sub">{[b.event_type, b.shoot_date && short(b.shoot_date)].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="ppm-track">
        <ol className="ppm-rail">
          {steps.map((st, i) => (
            <li key={st.key} className={`ppm-step is-${st.state}${i === next ? ' is-next' : ''}`}>
              <Knob b={b} st={st} onPick={onPick} />
            </li>
          ))}
        </ol>
        {nextStep && <p className={`ppm-next at-${next}`}>Next: {nextStep.next}</p>}
      </div>
      <button type="button" className={`ppm-badge is-${badge.kind}`} onClick={() => onPick({ lead: b, field: 'delivery_due_at', label: '📅 Delivery due' })}
        title="Change the delivery due date">{badge.text}</button>
      <button type="button" className="ppm-log-btn" onClick={onLog} aria-expanded={open} title={open ? 'Close the log' : 'Messages and emails'}>{open ? '✕' : '📜'}</button>
      {open && <BookingLog log={log} />}
    </div>
  );
}

/** a step's dot: Booked and Shoot come from the booking; the others open the date box (Edited asks which first) */
function Knob({ b, st, onPick }) {
  const when = st.at ? short(st.at) : '';
  const said = st.state === 'done' ? `done${when ? ` ${when}` : ''}` : st.state === 'half' ? 'partly done' : 'not yet';
  if (st.key === 'booked' || st.key === 'shoot') {
    return <span className="ppm-knob" role="img" aria-label={`${st.label}: ${said}`} title={`${st.label}: ${st.key === 'shoot' && st.at ? short(st.at) : said}`} />;
  }
  const pick = st.key === 'edited' ? { lead: b, choices: EDITED } : { lead: b, field: st.field, label: st.edit };
  return (
    <button type="button" className="ppm-knob" onClick={() => onPick(pick)} aria-label={`${st.label}: ${said} — change`}
      title={`${st.label}: ${said} — click to change`} />
  );
}

/** under a row (when open): messages sent outside iwopo and the emails iwopo sent */
function BookingLog({ log }) {
  return (
    <div className="ppm-log">
      {!log ? 'Loading…' : (
        <div className="ppm-log-in">
          <div><b>Messages outside iwopo</b>{log.outside_messages.length === 0 ? <p className="ppm-sub">None recorded.</p>
            : <ul>{log.outside_messages.map(m => <li key={m.id}><span className="ppm-sub">{short(m.sent_at)} · {m.channel}{m.direction === 'in' ? ' (from them)' : ''}</span> {m.text}</li>)}</ul>}</div>
          <div><b>Emails iwopo sent</b>{log.emails.length === 0 ? <p className="ppm-sub">None yet.</p>
            : <ul>{log.emails.map(m => <li key={m.id}><span className="ppm-sub">{short(m.sent_at)}</span> {m.subject}{!m.ok && <em className="ppm-fail"> · failed</em>}</li>)}</ul>}</div>
        </div>
      )}
    </div>
  );
}

/** Edited is two things: pick photos or videos, then the usual date box */
function EditedChooser({ edit, onChoose, onClose }) {
  const { lead, choices } = edit;
  return (
    <div className="ppm-pop-back" role="dialog" aria-modal="true" aria-label="Edited" onClick={onClose}>
      <div className="ppm-pop" onClick={e => e.stopPropagation()}>
        <h3>🎨 Edited</h3>
        <p className="ppm-sub">{lead.client}{lead.event_type ? ` · ${lead.event_type}` : ''}</p>
        {choices.map(([field, label]) => (
          <button key={field} type="button" className="ppm-pop-pick" onClick={() => onChoose(field, label)}>
            <span>{label}</span><span className={`ppm-pop-state${lead[field] ? ' is-done' : ''}`}>{lead[field] ? `✓ ${short(lead[field])}` : 'not yet'}</span>
          </button>
        ))}
        <div className="ppm-pop-foot"><button type="button" className="ppm-pop-close" onClick={onClose}>Close</button></div>
      </div>
    </div>
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
