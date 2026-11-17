/**
 * ✉️ One client email, read before it goes (Raj, 2026-11-17): the payment reminder (Payments, on a lead or booking)
 * and the review request (a booking). The server fills the vendor's own email for this client
 * (lib/leadEmails.js) — the amount due, their page, the review link — and this shows it exactly as it will arrive.
 * Its words and design are changed in Settings → Setup Email.
 */
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function LeadEmailModal({ lead, kind, title, onClose, onSent }) {
  const [mail, setMail] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.leadEmailPreview(lead.id, kind).then(setMail).catch(e => setErr(e.message));
  }, [lead.id, kind]);

  async function send() {
    setBusy(true); setErr('');
    try { await api.sendLeadEmail(lead.id, kind); onSent?.(); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="al-overlay" onClick={onClose}>
      <div className="gal-set-modal ev-modal lem" onClick={e => e.stopPropagation()}>
        <div className="al-head">
          <h3 className="al-title">{title}</h3>
          <button type="button" className="al-x" onClick={onClose}>✕</button>
        </div>
        {!mail && !err && <p className="ev-modal-text">Loading…</p>}
        {mail && (
          <>
            <p className="lem-to">To <b>{mail.to}</b></p>
            <p className="lem-subj">{mail.subject}</p>
            {mail.html
              /* sandbox with nothing allowed: the design shows, nothing in it can run */
              ? <iframe className="et-frame lem-frame" title="Email preview" sandbox="" srcDoc={mail.html} />
              : <div className="lem-body">{mail.body}</div>}
            <p className="lem-hint">Change its words or design in Settings → Setup Email.</p>
          </>
        )}
        {err && <p className="lem-err u-color-red">{err}</p>}
        <div className="pop-foot">
          <button type="button" className="pop-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="pop-btn" onClick={send} disabled={!mail || busy}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}
