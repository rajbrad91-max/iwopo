/**
 * 🏠 The vendor’s dashboard: today, upcoming events and the numbers.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api, eventDateValue } from '../../lib/api';
import { EventCard } from './Calendar';
import { S_LABEL } from './statuses';

/**
 * 📊 One dashboard tile. Every tile opens the list it counts.
 *
 * A real button rather than a clickable div, so it can be reached by keyboard
 * and announces itself to a screen reader — three of these were dead numbers
 * and the fourth was a div with a cursor style, which looks clickable to a
 * mouse and to nothing else.
 */
function StatTile({ icon, value, label, onOpen }) {
  return (
    <button type="button" className="card is-link" onClick={onOpen} aria-label={`${label}: ${value}. Open`}>
      <div className="ic">{icon}</div>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </button>
  );
}

export function DashHome({ goTab, openBooking }) {
  const [leads, setLeads] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.leads().catch(() => ({ leads: [] })),
      api.bookings().catch(() => ({ bookings: [] })),
      api.albums().catch(() => ({ albums: [] })),
    ]).then(([l, b, a]) => { setLeads(l.leads || []); setBookings(b.bookings || []); setAlbums(a.albums || []); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;

  const newLeads = leads.filter(l => l.status === 'new').length;
  const booked = leads.filter(l => l.status === 'booked').length;
  const photoSel = albums.reduce((n, a) => n + (Number(a.selected_count) > 0 ? 1 : 0), 0);
  const recent = leads.slice(0, 6);
  const upcoming = bookings
    .filter(b => b.event_date && eventDateValue(b.event_date) >= new Date(new Date().toDateString()))
    .sort((a, b) => eventDateValue(a.event_date) - eventDateValue(b.event_date))
    .slice(0, 6);
  const SB = { new: 'trial', quoted: 'trial', booked: 'active' };

  return (
    <>
      <div className="dash-grid">
        <div className="dash-left">
          {/* 🟢 4 tiles — each opens the list it counts. A number you can see
              but not act on just makes you go and find it yourself. */}
          <div className="stats dash-stats-4">
            <StatTile icon="📋" value={leads.length} label="Total Leads" onOpen={() => goTab('leads')} />
            <StatTile icon="✨" value={newLeads} label="New Leads" onOpen={() => goTab('leads')} />
            <StatTile icon="✅" value={booked} label="Booked" onOpen={() => goTab('bookings')} />
            {/* 🖼️ Straight to the page that lists them, not to Galleries.
                It sent you to a list of albums to go and find the selections
                yourself — one more step than the tile implied, and the reason
                there appeared to be several places to look. */}
            <StatTile icon="🖼️" value={photoSel} label="Photo Selection" onOpen={() => goTab('requests')} />
          </div>

          {/* 🟡 Recent Leads */}
          <div className="u-display-flex u-justify-content-space-between u-align-items-center u-margin-20px-0-10px">
            <h2 className="u-margin-0">📋 Recent Leads</h2>
            <button className="refresh u-padding-6px-14px u-font-size-12px" onClick={() => goTab('leads')}>View all →</button>
          </div>
          <div className="table-wrap">
            <table className="dash-recent">
              <thead><tr><th>Name</th><th>Event</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr><td colSpan="4" className="empty">No leads yet. Share your inquiry link! 📨</td></tr>
                ) : recent.map(l => (
                  <tr className="u-cursor-pointer" key={l.id} onClick={() => goTab('leads')}>
                    <td className="biz">{l.name}</td>
                    <td>{l.event_type}</td>
                    <td>{l.event_date ? String(l.event_date).slice(0, 10) : '—'}</td>
                    <td><span className={`badge ${SB[l.status] || 'trial'}`}>{S_LABEL[l.status] || l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🔵 Upcoming Events (right column) */}
        <div className="dash-right">
          <h2 className="u-margin-0-0-14px">📅 Upcoming Events</h2>
          {upcoming.length === 0 ? (
            <div className="table-wrap u-padding-30px u-text-align-center u-color-muted">No upcoming events 🗓️</div>
          ) : upcoming.map(b => {
            return <EventCard key={b.id} b={b} onOpen={() => openBooking(b.id)} />;
          })}
        </div>
      </div>
    </>
  );
}
