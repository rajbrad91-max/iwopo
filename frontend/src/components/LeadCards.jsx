import { eventDateParts, eventDateValue, fmtTime } from '../lib/api';
import { hoursBetween, formatHours } from '../pages/InquiryForm';
import './leadCards.css';

/**
 * 🗂️ The lead page as cards (Raj, 2026-11-04 — layout "B").
 *
 * Contact beside the main event, the pre-events below as slim date-tile cards, the notes last. The cards only
 * show — the page's one ✏️ Edit Details button edits everything (Raj: one way in, not a pencil per card). The
 * Pre-events card keeps ＋ Add, which opens the pre-event editor: a vendor whose form has no Pre-Events question
 * has no other way to add one.
 *
 * The main event card carries the event and every other answer the client gave about it, so it grows as the
 * vendor's form asks more.
 */
const spanHours = (from, to) => { const s = hoursBetween(from, to); return s !== null && s <= 16 ? formatHours(s) : ''; };
const timeRange = (from, to) => [from, to].filter(Boolean).map(fmtTime).join(' – ');
// date first (undated last), then start time — the order the wedding week happens in
const byDateThenTime = (a, b) => {
  const da = eventDateValue(a.date)?.getTime() ?? Infinity, db = eventDateValue(b.date)?.getTime() ?? Infinity;
  return da - db || String(a.from || '').localeCompare(String(b.from || ''));
};

/** The slim calendar tile: weekday, day, month, year. */
function DateTile({ date, main = false }) {
  const p = eventDateParts(date);
  return (
    <div className={`ldc-tile${main ? ' is-main' : ''}`} aria-hidden="true">
      <span className="ldc-tile-sm">{p.dowShort || ''}</span>
      <span className="ldc-tile-day">{p.day}</span>
      <span className="ldc-tile-sm">{p.mon}</span>
      <span className="ldc-tile-year">{p.year || ''}</span>
    </div>
  );
}

/** 👤 Who the client is and how to reach them. `items` are [icon, text] pairs; empty ones are left out. */
export function ContactCard({ name, role, items, meta }) {
  return (
    <div className="ld-card">
      <div className="ld-card-h">👤 Contact</div>
      <div className="ldc-person">{name || '—'}</div>
      {role && <div className="ldc-role">{role}</div>}
      {items.filter(([, t]) => t).map(([icon, text], i) => (
        <div className="ldc-line ldc-iconline" key={i}><span aria-hidden="true">{icon}</span><span>{text}</span></div>
      ))}
      {meta.some(([, t]) => t) && (
        <div className="ldc-meta">{meta.filter(([, t]) => t).map(([icon, text], i) => <div key={i}>{icon} {text}</div>)}</div>
      )}
    </div>
  );
}

/** 💍 The main event and every other answer about it (`details`: [label, value] pairs). */
export function MainEventCard({ ev, details }) {
  const hours = ev && (ev.hours || spanHours(ev.from, ev.to));
  const time = ev && timeRange(ev.from, ev.to);
  return (
    <div className="ld-card ldc-main">
      <div className="ldc-event">
        {ev && <DateTile date={ev.date} main />}
        <div className="ldc-event-body">
          <div className="ldc-name">{ev ? ev.name : '🎉 Event details'}{ev && <span className="ldc-badge">MAIN</span>}</div>
          {ev && (
            <>
              <div className="ldc-pills">
                {time && <span className="ldc-pill">🕐 {time}</span>}
                {hours && <span className="ldc-pill">⏱️ {hours}</span>}
                {ev.guests && <span className="ldc-pill">👥 {ev.guests}</span>}
              </div>
              {ev.location && <div className="ldc-line">📍 {ev.location}</div>}
            </>
          )}
        </div>
      </div>
      {details.length > 0 && (
        <dl className="ldc-details">
          {details.map(([label, value], i) => <div className="ldc-detail" key={i}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
    </div>
  );
}

function PreEventCard({ ev }) {
  const hours = ev.hours || spanHours(ev.from, ev.to);
  const time = timeRange(ev.from, ev.to);
  return (
    <div className="ldc-pre">
      <DateTile date={ev.date} />
      <div className="ldc-event-body">
        <div className="ldc-name">{ev.name}</div>
        {(time || hours) && <div className="ldc-line"><span className="ldc-nowrap">🕐 {time}</span>{hours && <span className="ldc-chip">{hours}</span>}</div>}
        {ev.location && <div className="ldc-line">📍 {ev.location}</div>}
        {(ev.guests || ev.service) && (
          <div className="ldc-line">{ev.guests ? `👥 ${ev.guests} guests` : ''}{ev.service && <span className="ldc-chip ldc-svc">{ev.service}</span>}</div>
        )}
      </div>
    </div>
  );
}

/** 🗓️ Mehndi, Jaggo, Reception… in date and time order. They print in the contract's schedule. With none, one
 *  short line says so; ＋ Add sits in the title row either way. */
export function PreEventCards({ preEvents, onAdd }) {
  const list = (Array.isArray(preEvents) ? preEvents : []).filter(e => String(e.name || '').trim()).sort(byDateThenTime);
  return (
    <div className="ld-card">
      <div className="ldc-head">
        <div className="ld-card-h">🗓️ Pre-events</div>
        <button type="button" className="refresh ldc-add" onClick={onAdd}>＋ Add</button>
      </div>
      {list.length > 0
        ? <div className="ldc-pre-grid">{list.map((ev, i) => <PreEventCard key={i} ev={ev} />)}</div>
        : <p className="ldc-empty">No pre-events for this lead.</p>}
    </div>
  );
}

/** 📝 The client's free-text note, last — the card stays, saying so, when there is none. */
export function NotesCard({ notes }) {
  return (
    <div className="ld-card">
      <div className="ld-card-h">📝 Notes</div>
      {notes ? <p className="ldc-notes">{notes}</p> : <p className="ldc-empty">No notes.</p>}
    </div>
  );
}
