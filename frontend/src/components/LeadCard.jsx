import './leadCard.css';
import { fmtDateTime } from '../lib/api';

/**
 * 📱 A lead as a card on phones (Raj, 2026-10-27, after his Perfect Poses reference): name, email and phone on one
 * line; Event (with the service asked for), Date, Location, Package (only the client's pick — or the folder that was
 * sent — with the price unless Payment privacy is on, in which case the server sends no amounts) and Status, with
 * a small 📤 Send beside the status. Rows with nothing to say are left out; tapping the card opens the lead.
 * The desktop table never shows this — it is a cell of its own, hidden there.
 */
const STATUS = { new: 'New', quoted: 'Package Sent', booked: 'Booking Confirmed' };
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

export default function LeadCard({ lead: l, history = false, onSend, onRestore }) {
  const pick = (Array.isArray(l.pkgs) ? l.pkgs : []).find(p => p.picked);
  const folder = !pick && (l.package_name || (l.package_template_id ? l.template_name || 'Sent' : ''));
  const canSend = !history && l.package_template_id && l.email;
  const sent = l.packages_sent_at ? `Sent ${day(l.packages_sent_at)}` : '';
  return (
    <div className="lc">
      <div className="lc-head">
        <p className="lc-name">{l.name}</p>
        {(l.email || l.phone) && (
          <p className="lc-contact">{l.email && <span>{l.email}</span>}{l.phone && <span>{l.phone}</span>}</p>
        )}
      </div>
      {/* 📅 when it arrived — its own line under the name, never squeezed into the name row */}
      {l.created_at && <p className="lc-received">📥 Received {fmtDateTime(l.created_at)}</p>}
      <dl className="lc-rows">
        {l.event_type && (
          <div className="lc-row"><dt>Event</dt><dd>{l.event_type}{l.service && <span className="lc-aside">{l.service}</span>}</dd></div>
        )}
        {l.event_date && <div className="lc-row"><dt>Date</dt><dd>{day(l.event_date)}</dd></div>}
        {l.location && <div className="lc-row"><dt>Location</dt><dd>{l.location}</dd></div>}
        {(pick || folder) && (
          <div className="lc-row"><dt>Package</dt><dd>
            {pick ? <span className="lc-pick">✓ {pick.name}{pick.price != null && <>: <b>{money(pick.price)}</b></>}</span> : <>📁 {folder}</>}
            {sent && <span className="lc-aside">{sent}</span>}
          </dd></div>
        )}
        <div className="lc-row"><dt>Status</dt><dd>
          <span className="lc-status-line">
            {/* the button sits centred in the open space between "Status" and the pill */}
            <span className="lc-btn-slot">
              {canSend && <button type="button" className="lc-send" onClick={e => onSend(l, e)} title={`Email the packages to ${l.email}`}>📤 Send</button>}
              {history && <button type="button" className="lc-restore" onClick={e => onRestore(l.id, e)}>↩️ Restore</button>}
            </span>
            <span className={`lc-status lc-st-${l.status || 'new'}`}>{STATUS[l.status] || l.status}</span>
          </span>
        </dd></div>
      </dl>
    </div>
  );
}
