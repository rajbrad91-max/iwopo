/* 📧 "Email to client": sends the client the contract they signed (never the certificate).
   It goes by itself when the booking is confirmed; this is for sending it again, or for a booking
   confirmed before that rule existed. Nothing goes to a client on one click — it asks first (Raj, 2026-11-17).
   `onSent(at)`: after a send, with its time, for a page that shows when it was last emailed. */
import { useState } from 'react';
import { api, fmtDateTime } from '../../lib/api';
import { useDialog } from '../../lib/dialog.jsx';

export function EmailCopyButton({ contract, clientName, clientEmail, className = '', onSent }) {
  const dialog = useDialog();
  const [sentAt, setSentAt] = useState(contract?.client_copy_sent_at || null);
  const [state, setState] = useState('idle');   // idle | busy | done | error
  const [msg, setMsg] = useState('');
  if (!contract?.id) return null;
  const sentDay = sentAt ? fmtDateTime(sentAt, { dateOnly: true }) : '';

  async function send() {
    if (state === 'busy') return;
    const to = clientEmail ? `, to ${clientEmail}` : '';
    const before = sentAt ? `\n\nIt was already emailed on ${sentDay}.` : '';
    const ok = await dialog.confirm(`This sends ${clientName || 'the client'} a copy of the contract they signed${to}.${before}`,
      { title: 'Email the signed contract?', okLabel: 'Send email', danger: false });
    if (!ok) return;
    setState('busy'); setMsg('');
    try {
      const r = await api.emailContractCopy(contract.id);
      const at = r.client_copy_sent_at || new Date().toISOString();
      setSentAt(at); onSent?.(at);
      setState('done'); setMsg(`Sent to ${r.to}`);
    } catch (err) {
      setState('error'); setMsg(err.message || 'Could not send');
    }
  }

  const label = state === 'busy' ? 'Sending…'
    : state === 'done' ? `✓ ${msg}`
    : sentAt ? 'Email again' : 'Email to client';
  return (
    <button type="button" className={`${className} ecb`} onClick={send} disabled={state === 'busy'}
      title={`${sentAt ? `Last emailed ${sentDay}. ` : ''}Emails the client the contract they signed. The certificate stays here.`}>
      {label}{state === 'error' && <span className="u-color-red"> · {msg}</span>}
    </button>
  );
}
