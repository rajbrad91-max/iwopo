/* 📧 "Email to client": sends the client the contract they signed (never the certificate).
   It goes by itself when the booking is confirmed; this is for sending it again, or for a booking
   confirmed before that rule existed. */
import { useState } from 'react';
import { api, fmtDateTime } from '../../lib/api';

export function EmailCopyButton({ contract, className = '' }) {
  const [sentAt, setSentAt] = useState(contract?.client_copy_sent_at || null);
  const [state, setState] = useState('idle');   // idle | busy | done | error
  const [msg, setMsg] = useState('');
  if (!contract?.id) return null;

  async function send() {
    if (state === 'busy') return;
    setState('busy'); setMsg('');
    try {
      const r = await api.emailContractCopy(contract.id);
      setSentAt(r.client_copy_sent_at || new Date().toISOString());
      setState('done'); setMsg(`Sent to ${r.to}`);
    } catch (err) {
      setState('error'); setMsg(err.message || 'Could not send');
    }
  }

  const label = state === 'busy' ? 'Sending…'
    : state === 'done' ? `✓ ${msg}`
    : sentAt ? `📧 Emailed ${fmtDateTime(sentAt, { dateOnly: true })} · send again`
    : '📧 Email to client';
  return (
    <button type="button" className={`${className} ecb`} onClick={send} disabled={state === 'busy'}
      title="Emails the client the contract they signed. The certificate stays here.">
      {label}{state === 'error' && <span className="u-color-red"> · {msg}</span>}
    </button>
  );
}
