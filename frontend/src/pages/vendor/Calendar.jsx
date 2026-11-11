/**
 * 📅 The booking calendar, and the event card it shares with the dashboard.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef } from 'react';
import { api, fmtTime, fmtEventDate, eventDateParts, vendorDayKey } from '../../lib/api';

export function CalendarView({ onOpen, filter }) {
  const [bookings, setBookings] = useState([]);
  const [cur, setCur] = useState(() => {
    const key = vendorDayKey(new Date());
    const m = key.match(/^(\d{4})-(\d{2})/);
    return m ? { y: Number(m[1]), m: Number(m[2]) - 1 } : { y: new Date().getFullYear(), m: new Date().getMonth() };
  });
  const [selDay, setSelDay] = useState(null);
  const [dir, setDir] = useState('left');

  useEffect(() => {
    api.bookings().then(d => setBookings(d.bookings || [])).catch(() => {});
  }, []);

  // 🔍 when searching from Bookings, only show matching events on the calendar
  const term = (filter || '').trim().toLowerCase();
  const shown = !term ? bookings : bookings.filter(b =>
    [b.name, b.event_type, b.event_date, b.location, b.phone, b.email]
      .some(v => v && String(v).toLowerCase().includes(term)));

  const byDay = {};
  shown.forEach(b => {
    if (!b.event_date) return;
    const k = String(b.event_date).slice(0, 10);
    (byDay[k] = byDay[k] || []).push(b);
  });

  const first = new Date(cur.y, cur.m, 1);
  const startPad = first.getDay();
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const monthName = first.toLocaleString('default', { month: 'long', year: 'numeric' });
  const today = vendorDayKey(new Date());
  const key = (d) => `${cur.y}-${String(cur.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const move = (n) => { setDir(n > 0 ? 'left' : 'right'); setSelDay(null); setCur(c => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; }); };

  // 👆 finger swipe
  const touch = useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
  };

  const selected = selDay ? (byDay[selDay] || []) : [];
  const selLabel = selDay ? fmtEventDate(selDay, { long: true }) : '';

  return (
    <div className="cal-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="table-wrap cal-panel">
        <div className="cal-nav">
          <button className="refresh" onClick={() => move(-1)}>←</button>
          <h2 className="cal-month">🗓️ {monthName}</h2>
          <button className="refresh" onClick={() => move(1)}>→</button>
        </div>
        <div className="cal-dow">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div key={`${cur.y}-${cur.m}`} className={`cal-grid slide-${dir}`}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const k = key(d);
            const evts = byDay[k] || [];
            const isToday = k === today;
            const cls = ['cal-cell'];
            if (evts.length) cls.push('has-evt');
            if (selDay === k) cls.push('is-sel');
            else if (isToday) cls.push('is-today');
            return (
              <div key={i} className={cls.join(' ')} onClick={() => evts.length && setSelDay(k)}>
                <div className="cal-daynum">{d}</div>
                {evts.slice(0, 2).map(e => (
                  <div key={e.id} className="cal-daylbl">✅ {e.name}</div>
                ))}
                {evts.length > 2 && <div className="cal-daymore">+{evts.length - 2}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 📋 The day's events, beside the calendar rather than beneath it. Under
          the grid each event got one cramped line and pushed the next one off
          the screen; there is room to the side to lay a day out properly.
          Money is deliberately absent — this is the page for running the day,
          and what is owed belongs on the booking, not on the schedule. */}
      <aside className="table-wrap cal-side">
        {!selDay ? (
          <div className="cal-side-empty">
            <div className="cal-side-icon">🗓️</div>
            <p>Pick a highlighted day to see what&apos;s on.</p>
          </div>
        ) : (
          <>
            <div className="cal-side-head">
              <span className="cal-side-date">{selLabel}</span>
              <button className="cal-side-x" onClick={() => setSelDay(null)} aria-label="Close">✕</button>
            </div>
            {selected.map(b => <EventCard key={b.id} b={b} onOpen={onOpen ? () => onOpen(b) : null} />)}
          </>
        )}
      </aside>
    </div>
  );
}

/** 📅 One event card, used by the dashboard's Upcoming Events AND the calendar's day panel — one design everywhere
 *  (Raj, 2026-10-23). The whole card opens the booking; no separate "open" link. */
export function EventCard({ b, onOpen }) {
  const d = eventDateParts(b.event_date);
  const open = onOpen ? () => onOpen(b) : undefined;
  return (
    <div className={`ev-card ${onOpen ? 'is-open' : ''}`} onClick={open} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(b); } }) : undefined}>
      <div className="ev-date">
        <div className="ev-day">{d.day}</div>
        <div className="ev-mon">{d.mon}</div>
        <div className="ev-dow">{d.dow}</div>
      </div>
      <div className="ev-body">
        <div className="ev-name">{b.name}</div>
        <div className="ev-type">{b.event_type}{b.package_snapshot?.name ? ` · ${b.package_snapshot.name}` : ''}</div>
        <div className="ev-line ev-time"><span className="ev-ic">🕐 </span>{b.timing_from || b.timing_to ? `${b.timing_from ? fmtTime(b.timing_from) : '?'}–${b.timing_to ? fmtTime(b.timing_to) : '?'}` : 'Time to be confirmed'}</div>
        {b.location && <div className="ev-line ev-loc"><span className="ev-ic">📍 </span>{b.location}</div>}
        {b.phone && <div className="ev-line ev-phone"><span className="ev-ic">📞 </span>{b.phone}</div>}
        {b.email && <div className="ev-line ev-mail"><span className="ev-ic">✉️ </span>{b.email}</div>}
      </div>
    </div>
  );
}
