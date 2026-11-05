import { eventDateParts, eventDateValue, fmtTime } from '../lib/api';
import { hoursBetween, formatHours } from '../pages/InquiryForm';
import Emo from './Emo';
import './leadCards.css';

/**
 * 🗂️ The lead page as cards (Raj, 2026-11-04).
 *
 * The contact runs as one strip across the top; under it the main event leads the left column — with every
 * other answer the vendor's form asked about it — then the pre-events and the notes, while Payments and the
 * contract sit beside it on the right. The cards only show; the page's ✏️ Edit Details edits everything, and
 * the Pre-events card keeps ＋ Add (a vendor whose form has no Pre-Events question has no other way in).
 *
 * Everything the client filled in shows; an empty answer leaves no empty slot.
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

/** 👤 The client in one strip: name and role, how to reach them, the answers that follow on from those (a friend's
 *  name when they heard from a friend), where they came from and when.
 *  `items` and `meta` are [Fluent code point, text] pairs, `answers` [label, value]; empty ones are left out. */
export function ContactStrip({ name, role, items, meta, answers = [] }) {
  const shown = (list) => list.filter(([, t]) => t);
  return (
    <div className="ld-card ldc-strip-card">
      <div className="ldc-strip">
        <div className="ldc-who">
          <span className="ldc-person">{name || '—'}</span>
          {role && <span className="ldc-role">{role}</span>}
        </div>
        {shown(items).map(([cp, text], i) => <span className="ldc-pill" key={i}><Emo cp={cp} />{text}</span>)}
        {answers.map(([label, value], i) => <span className="ldc-pill" key={`a${i}`}><span className="ldc-pill-label">{label}</span>{value}</span>)}
        {shown(meta).length > 0 && (
          <div className="ldc-meta">
            {shown(meta).map(([cp, text], i) => <span key={i}><Emo cp={cp} />{text}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 💍 The main event and every other answer about it (`details`: [label, value] pairs). `onEdit`, where given, puts
 *  ✏️ Edit Details at the card's top right. */
export function MainEventCard({ ev, details, onEdit }) {
  const hours = ev && (ev.hours || spanHours(ev.from, ev.to));
  const time = ev && timeRange(ev.from, ev.to);
  const edit = onEdit && (
    <button className="refresh ld-edit-btn ldc-edit" onClick={onEdit} title="Edit contact details, event answers, pre-events and notes">✏️ Edit Details</button>
  );
  return (
    <div className="ld-card ldc-main">
      {ev && (
        <div className="ldc-event">
          <DateTile date={ev.date} main />
          <div className="ldc-event-body">
            <div className="ldc-name">{ev.name}<span className="ldc-badge">MAIN</span></div>
            <div className="ldc-pills">
              {time && <span className="ldc-pill"><Emo cp="1f550" />{time}</span>}
              {hours && <span className="ldc-pill"><Emo cp="23f1" />{hours}</span>}
              {ev.guests && <span className="ldc-pill"><Emo cp="1f465" />{ev.guests}</span>}
            </div>
            {ev.location && <div className="ldc-line"><Emo cp="1f4cd" /><span>{ev.location}</span></div>}
          </div>
          {edit}
        </div>
      )}
      {!ev && <div className="ldc-head"><div className="ld-card-h">🎉 Event details</div>{edit}</div>}
      {!ev && !details.length && <p className="ldc-empty">No event details yet.</p>}
      {details.length > 0 && (
        <dl className={`ldc-details${ev ? '' : ' is-first'}`}>
          {details.map(([label, value], i) => <div className="ldc-detail" key={i}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
    </div>
  );
}

/** One pre-event: tile, name, the time, the place, then hours · guests · service as chips. */
function PreEventCard({ ev }) {
  const hours = ev.hours || spanHours(ev.from, ev.to);
  const time = timeRange(ev.from, ev.to);
  const chips = [['23f1', hours, ''], ['1f465', ev.guests && `${ev.guests} guests`, ''], ['1f3ac', ev.service, ' ldc-svc']].filter(([, t]) => t);
  return (
    <div className="ldc-pre">
      <DateTile date={ev.date} />
      <div className="ldc-event-body">
        <div className="ldc-name">{ev.name}</div>
        {time && <div className="ldc-time"><Emo cp="1f550" />{time}</div>}
        {ev.location && <div className="ldc-line"><Emo cp="1f4cd" /><span>{ev.location}</span></div>}
        {chips.length > 0 && (
          <div className="ldc-chips">{chips.map(([cp, text, tone], i) => <span className={`ldc-chip${tone}`} key={i}><Emo cp={cp} />{text}</span>)}</div>
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

/** 📝 The client's free-text note — the card stays, saying so, when there is none. */
export function NotesCard({ notes }) {
  return (
    <div className="ld-card">
      <div className="ld-card-h">📝 Notes</div>
      {notes ? <p className="ldc-notes">{notes}</p> : <p className="ldc-empty">No notes.</p>}
    </div>
  );
}
