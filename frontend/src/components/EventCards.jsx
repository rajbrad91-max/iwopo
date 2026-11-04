import { eventDateParts, eventDateValue, fmtTime } from '../lib/api';
import { hoursBetween, formatHours } from '../pages/InquiryForm';
import './eventCards.css';

/**
 * 🗓️ A lead's events as cards (Raj, 2026-11-04 — "slim date tile").
 *
 * The main event and every pre-event, in date and time order, each with a small calendar tile (weekday, day,
 * month, year). The main event is marked. The cards only show: ✏️ on the main event opens Edit details, ✏️ on a
 * pre-event — or "Add pre-event" — opens the pre-event editor, so all editing stays where it already lives.
 */
const spanHours = (from, to) => { const s = hoursBetween(from, to); return s !== null && s <= 16 ? formatHours(s) : ''; };
const timeRange = (from, to) => [from, to].filter(Boolean).map(fmtTime).join(' – ');
// date first (undated last), then start time — the order the wedding week happens in
const order = (a, b) => {
  const da = eventDateValue(a.date)?.getTime() ?? Infinity, db = eventDateValue(b.date)?.getTime() ?? Infinity;
  return da - db || String(a.from || '').localeCompare(String(b.from || ''));
};

function EventCard({ ev, onEdit }) {
  const p = eventDateParts(ev.date);
  const hours = ev.hours || spanHours(ev.from, ev.to);
  const time = timeRange(ev.from, ev.to);
  return (
    <div className={`evc-card${ev.main ? ' is-main' : ''}`}>
      <div className="evc-tile" aria-hidden="true">
        <span className="evc-dow">{p.dowShort || ''}</span>
        <span className="evc-day">{p.day}</span>
        <span className="evc-mon">{p.mon}</span>
        <span className="evc-year">{p.year || ''}</span>
      </div>
      <div className="evc-body">
        <div className="evc-head">
          <div className="evc-name">{ev.name}{ev.main && <span className="evc-main">MAIN</span>}</div>
          <button type="button" className="evc-edit" onClick={onEdit} aria-label={`Edit ${ev.name}`}>✏️</button>
        </div>
        {(time || hours) && <div className="evc-row"><span className="evc-nowrap">🕐 {time}</span>{hours && <span className="evc-chip">{hours}</span>}</div>}
        {ev.location && <div className="evc-row">📍 {ev.location}</div>}
        {(ev.guests || ev.service) && (
          <div className="evc-row">{ev.guests ? `👥 ${ev.guests} guests` : ''}{ev.service && <span className="evc-chip evc-svc">{ev.service}</span>}</div>
        )}
      </div>
    </div>
  );
}

export default function EventCards({ main, preEvents, onEditMain, onEditPre }) {
  const events = [
    ...(main ? [{ ...main, main: true }] : []),
    ...(Array.isArray(preEvents) ? preEvents : []).filter(e => String(e.name || '').trim()),
  ].sort(order);
  return (
    <div className="ld-card">
      <div className="ld-card-h">🗓️ Events</div>
      {events.length > 0 && (
        <div className="evc-grid">
          {events.map((ev, i) => <EventCard key={i} ev={ev} onEdit={ev.main ? onEditMain : onEditPre} />)}
        </div>
      )}
      <div className="evc-actions">
        <button type="button" className="refresh" onClick={onEditPre}>＋ Add pre-event</button>
      </div>
    </div>
  );
}
