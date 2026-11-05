import { useState } from 'react';
import { api } from '../lib/api';
import { shownFields } from '../lib/formRules';
import { InquiryShell, LeadFormBody, formProblems, formAnswers, focusFirstProblem, BOOKING_FIELDS } from '../pages/InquiryForm';

/**
 * ✏️ Edit Details — the client's own inquiry form (InquiryShell + LeadFormBody): the same theme, colours, font and
 * questions, editable, and checked by the same rules. The lead page and the booking page both open it from the main
 * event card (moved here from the lead page, 2026-11-05, so the two pages edit a lead the same way).
 * It opens fresh from the lead each time. `onSaved(lead)` hears the saved lead; `onClose(message)` closes it —
 * '✅ Saved' after a save, nothing on Cancel. `cfg` is the vendor's inquiry-form settings.
 */
export default function LeadEditor(props) {
  if (!props.cfg) return <div className="ld-view"><div className="loading">Loading…</div></div>;
  return <EditForm {...props} />;
}

function EditForm({ lead, cfg, onSaved, onClose }) {
  /* 🗓️ The form's Pre-Events question holds the client's original answer; Edit Details shows and saves the lead's own
     list through it, so a pre-event changed or removed here is changed everywhere. */
  const preEventsField = () => (cfg.custom_fields || []).find(f => f.type === 'pre_events');
  /* ✏️ A question that maps to one of the lead's own columns (date, venue, times, guests, hours, event type, getting
     ready…) starts from that column when its answer is empty — a lead added by hand, imported or older keeps those
     facts on the lead, not in the answers, and the form must open with them, as the lead page shows them. */
  const fromColumn = (f) => {
    const v = lead[f.maps_to];
    if (v === null || v === undefined || v === '') return undefined;
    if (f.type === 'checkbox') return v === true;
    if (f.maps_to === 'event_date') return String(v).slice(0, 10);
    if (f.type === 'time') return String(v).slice(0, 5);
    if (f.type === 'hours') return `${v} hr${Number(v) === 1 ? '' : 's'}`;
    return String(v);
  };

  const [ep, setEp] = useState({
    role: lead.role || '', name: lead.name || '', email: lead.email || '', phone: lead.phone || '',
    instagram: String(lead.instagram || '').replace(/^@/, ''), heard: lead.heard || '',   // the form shows the @ itself
    event_date: lead.event_date ? String(lead.event_date).slice(0, 10) : '',
    location: lead.location || '',
    timing_from: lead.timing_from ? String(lead.timing_from).slice(0, 5) : '',
    timing_to: lead.timing_to ? String(lead.timing_to).slice(0, 5) : '',
    guests: lead.guests ?? '',
  });
  const [eAnswers, setEAnswers] = useState(() => {
    const next = { ...(lead.custom_data || {}) };
    for (const f of cfg.custom_fields || []) {
      const empty = next[f.id] === undefined || next[f.id] === null || next[f.id] === '';
      if (f.maps_to && f.type !== 'pre_events' && empty) { const v = fromColumn(f); if (v !== undefined) next[f.id] = v; }
    }
    const pf = preEventsField();
    if (pf) next[pf.id] = (Array.isArray(lead.pre_events) ? lead.pre_events : []).map((e, k) => ({ ...e, _k: `saved-${k}` }));
    return next;
  });
  const [eNotes, setENotes] = useState(lead.notes || '');
  const [errs, setErrs] = useState({});
  const clearErr = (k) => setErrs(e => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const setEpi = (k, v) => { setEp(s => ({ ...s, [k]: v })); clearErr(k); clearErr(`booking:${k}`); };
  const setEAns = (id, v) => { setEAnswers(s => ({ ...s, [id]: v })); clearErr(`f:${id}`); };
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // 📅 the booking facts the vendor's form does not ask — Edit Details asks them itself (the contract needs them)
  const bookingKeys = BOOKING_FIELDS.map(b => b.key).filter(k => !(cfg.custom_fields || []).some(f => f.maps_to === k));

  async function save() {
    setMsg(''); setErrs({});
    const problems = formProblems(cfg, ep, eAnswers, { editing: true, bookingKeys });
    if (problems.length) {
      setErrs(Object.fromEntries(problems.map(x => [x.field, x.message])));
      return focusFirstProblem(problems[0].field);
    }
    setBusy(true);
    const pf = preEventsField();
    try {
      // the answers the lead already had stay; the questions on the form are written exactly as the client's form
      // writes them, and the server maps them onto the lead's date, venue, guests… (routes/leads.js)
      const custom = { ...(lead.custom_data || {}), ...formAnswers(shownFields(cfg.custom_fields || [], eAnswers, ep), eAnswers) };
      const preEvents = pf ? (eAnswers[pf.id] || []).map(({ _k, ...r }) => r).filter(r => String(r.name || '').trim()) : null;
      if (pf) custom[pf.id] = preEvents;
      const booking = Object.fromEntries(bookingKeys.map(k => [k, ep[k] === '' || ep[k] == null ? null : ep[k]]));
      const d = await api.updateLead(lead.id, {
        name: ep.name, email: ep.email, phone: ep.phone, role: ep.role,
        instagram: ep.instagram ? `@${ep.instagram}` : '', heard: ep.heard,
        notes: eNotes, custom_data: custom, ...booking,
        ...(pf ? { pre_events: preEvents } : {}),
      });
      if (onSaved && d?.lead) onSaved(d.lead);
      onClose('✅ Saved');
    } catch (e) { setMsg('⚠️ ' + e.message); setBusy(false); }
  }

  return (
    <div className="ld-view">
      <InquiryShell cfg={cfg} embedded>
        <div className="iq-body">
          <LeadFormBody cfg={cfg} p={ep} setPI={setEpi} answers={eAnswers} setAns={setEAns} notes={eNotes} setNotes={setENotes}
            errs={errs} bookingKeys={bookingKeys} />
          {msg && <div className="iq-err">{msg}</div>}
          {/* 💾 Save changes, and a small Cancel beside it — no bar above the form, which sits 16px under the header */}
          <div className="iq-actions">
            <button className="iq-btn" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : <><span className="iq-emoji">💾 </span>Save changes</>}
            </button>
            <button type="button" className="iq-btn-cancel" onClick={() => onClose()} disabled={busy} title="Leave without saving">Cancel</button>
          </div>
          <p className="iq-req-note">Fields marked * are required</p>
        </div>
      </InquiryShell>
    </div>
  );
}
