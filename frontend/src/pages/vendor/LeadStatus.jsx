/**
 * 🏷️ A lead's status — New, Package Sent, Booking Confirmed — with its icon beside the list (a list's own lines hold
 * text only). On the lead page it opens the Packages card, where the status moves on; a booking shows it at the top of
 * Payments (Raj, 2026-11-17). The page that shows it keeps the status (`status`, `onChange`), so a send or a confirmed
 * payment that moves it shows here at once.
 *
 * ❌ A booking can be cancelled (Raj, 2026-11-17): "Cancel booking" is a fourth line in the list of a confirmed booking
 * only, and it opens a pop-up that needs a reason and a tick before it does anything. The reason goes at the top of the
 * notes (`onCancelled(lead)` hands back the lead with them). A cancelled booking comes back by choosing Booking
 * Confirmed, which asks first.
 */
import { useState } from 'react';
import { api } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';
import NavIcon from '../../components/NavIcon';
import { STATUSES, S_ICON, S_LABEL } from './statuses';

export default function LeadStatus({ lead, status, onChange, onMessage, onCancelled }) {
  const dialog = useDialog();
  const [cancelling, setCancelling] = useState(false);
  // a confirmed booking can be cancelled; a cancelled one can only go back to Booking Confirmed
  const options = status === 'cancelled' ? ['booked', 'cancelled'] : status === 'booked' ? [...STATUSES, 'cancelled'] : STATUSES;
  const label = (s) => (s === 'cancelled' && status !== 'cancelled' ? 'Cancel booking' : S_LABEL[s]);

  async function change(s) {
    if (s === 'cancelled') { setCancelling(true); return; }
    if (status === 'cancelled' && !await dialog.confirm('It goes back to Booking Confirmed. The cancellation reason stays in the notes.',
      { title: 'Restore this booking?', okLabel: 'Restore booking', danger: false })) return;
    const was = status;
    onChange(s);
    try { await api.setLeadStatus(lead.id, s); onMessage(`✅ Status: ${S_LABEL[s]}`); }
    catch (e) { onChange(was); onMessage(`⚠️ ${e.message}`); }   // not saved: show what is really stored
  }
  function cancelled(l) {
    setCancelling(false);
    onChange('cancelled');
    onCancelled?.(l);
    onMessage('✅ Booking cancelled');
  }

  return (
    <div className="ms-status-row">
      <label className="ms-status-lbl" htmlFor={`ms-status-${lead.id}`}>Status</label>
      <select id={`ms-status-${lead.id}`} className="ms-status-sel" value={status} onChange={e => change(e.target.value)}
        title="Lead status: New, Package Sent, or Booking Confirmed">
        {options.map(s => <option key={s} value={s}>{label(s)}</option>)}
      </select>
      {S_ICON[status] && <NavIcon name={S_ICON[status]} />}
      {cancelling && <CancelBooking lead={lead} onClose={() => setCancelling(false)} onDone={cancelled} />}
    </div>
  );
}

/** ❌ The pop-up: nothing happens until the reason is written and the box is ticked */
function CancelBooking({ lead, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ready = sure && reason.trim().length > 0 && !busy;

  async function go() {
    if (!ready) return;
    setBusy(true); setErr('');
    try { const d = await api.cancelBooking(lead.id, reason.trim()); onDone(d.lead); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="al-overlay" onClick={onClose}>
      <div className="gal-set-modal ev-modal" onClick={e => e.stopPropagation()}>
        <div className="al-head">
          <h3 className="al-title">Cancel this booking?</h3>
          <button type="button" className="al-x" onClick={onClose}>✕</button>
        </div>
        <p className="ev-modal-text">
          <strong>{lead.name || 'This client'}</strong>&apos;s booking is marked Cancelled. It stays in Bookings, and its
          payments, contract and invoice stay as they are.
        </p>
        <label className="lbl" htmlFor={`cb-reason-${lead.id}`}>Reason for cancelling</label>
        <textarea id={`cb-reason-${lead.id}`} className="fb-input cb-reason" rows={3} maxLength={500} autoFocus
          value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Family emergency — the wedding is called off" />
        <p className="cb-hint">It goes at the top of this booking&apos;s notes.</p>
        <label className="cb-sure">
          <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} />
          I confirm I want to cancel this booking
        </label>
        {err && <p className="cb-err u-color-red">{err}</p>}
        <div className="pop-foot">
          <button type="button" className="pop-btn" onClick={onClose}>Keep booking</button>
          <button type="button" className="pop-btn" onClick={go} disabled={!ready}>{busy ? 'Cancelling…' : 'Cancel booking'}</button>
        </div>
      </div>
    </div>
  );
}
