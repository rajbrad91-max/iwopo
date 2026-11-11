/**
 * 🔔 The bell in the panel header: the vendor’s notifications.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef } from 'react';
import { api, fmtDateTime } from '../../lib/api';
import { chime } from '../../lib/chime';

/** "2h ago" / "3d ago" / "24 Jul" — relative for the first week, then a date,
 *  because "34d ago" stops meaning anything and by then the date is more use. */
function sinceLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days <= 7) return `${days}d ago`;
  return fmtDateTime(ts, { dateOnly: true });
}

export function NotifBell({ onOpen }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unseen: 0 });
  const boxRef = useRef(null);
  const lastSeenId = useRef(null);

  /* 🔔 Every 15 seconds, not every minute: a text or a missed call should
     reach the vendor while it still matters. The request is small. A new
     text or missed call also plays a short chime, so it is noticed without
     watching the bell. */
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  function load() {
    api.notifications().then(d => {
      const top = d.notifications?.[0];
      if (top && lastSeenId.current != null && top.id !== lastSeenId.current && top.type === 'comms') chime();
      if (top) lastSeenId.current = top.id;
      else if (lastSeenId.current == null) lastSeenId.current = 0;
      setData(d);
    }).catch(() => {});
  }

  // Close on a click anywhere else, or on Escape. Without this the panel stayed
  // open over whatever the vendor clicked next, which reads as a stuck menu.
  // Listening on mousedown rather than click means it closes before the click
  // lands, so pressing a button behind it still does what you'd expect.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unseen > 0) {
      await api.notificationsSeen().catch(() => {});
      setData(d => ({ ...d, unseen: 0 }));
    }
  }

  return (
    <div className="nb-wrap" ref={boxRef}>
      <button className="hdr-icon nb-btn" onClick={toggle} aria-label="Notifications">
        🔔
        {data.unseen > 0 && <span className="nb-count">{data.unseen > 99 ? '99+' : data.unseen}</span>}
      </button>

      {open && (
        <div className="nb-panel">
          <div className="nb-head">
            <span>Notifications</span>
            <button type="button" className="nb-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          {data.notifications.length === 0 ? (
            <p className="nb-empty">🔕 Nothing yet — new leads and client activity will show up here.</p>
          ) : (
            <ul className="nb-list">
              {data.notifications.map(n => {
                const body = (
                  <>
                    <p className="nb-title">{n.title}</p>
                    {n.body && <p className="nb-body">{n.body}</p>}
                    <p className="nb-when">{sinceLabel(n.created_at)}</p>
                  </>
                );
                // Only rows that know what they're about are clickable. Anything
                // raised before link_type existed still reads fine, it just sits
                // there rather than pretending to be a link that goes nowhere.
                return (
                  <li key={n.id} className={`nb-item ${n.link_type ? 'is-link' : ''}`}>
                    {n.link_type ? (
                      <button type="button" className="nb-hit"
                        onClick={() => { setOpen(false); onOpen(n); }}>
                        {body}
                      </button>
                    ) : body}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
