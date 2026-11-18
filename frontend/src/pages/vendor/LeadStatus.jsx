/**
 * 🏷️ A lead's status — New, Package Sent, Booking Confirmed — with its icon beside the list (a list's own lines hold
 * text only). On the lead page it opens the Packages card, where the status moves on; a booking shows it at the top of
 * Payments (Raj, 2026-11-17). The page that shows it keeps the status (`status`, `onChange`), so a send or a confirmed
 * payment that moves it shows here at once.
 */
import { api } from '../../lib/api';
import NavIcon from '../../components/NavIcon';
import { STATUSES, S_ICON, S_LABEL } from './statuses';

export default function LeadStatus({ lead, status, onChange, onMessage }) {
  async function change(s) {
    const was = status;
    onChange(s);
    try { await api.setLeadStatus(lead.id, s); onMessage(`✅ Status: ${S_LABEL[s]}`); }
    catch (e) { onChange(was); onMessage(`⚠️ ${e.message}`); }   // not saved: show what is really stored
  }
  return (
    <div className="ms-status-row">
      <label className="ms-status-lbl" htmlFor={`ms-status-${lead.id}`}>Status</label>
      <select id={`ms-status-${lead.id}`} className="ms-status-sel" value={status} onChange={e => change(e.target.value)}
        title="Lead status: New, Package Sent, or Booking Confirmed">
        {STATUSES.map(s => <option key={s} value={s}>{S_LABEL[s]}</option>)}
      </select>
      {S_ICON[status] && <NavIcon name={S_ICON[status]} />}
    </div>
  );
}
