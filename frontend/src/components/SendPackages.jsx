import { useState } from 'react';
import { api } from '../lib/api';
import { clientBase } from '../lib/clientBase';
import SendPackagesModal from '../pages/SendPackagesModal.jsx';

/**
 * 📤 What sending packages does once the email has gone: the lead is marked quoted and its offer timer starts, and its
 * packages lock so the offer cannot change under the client. Quiet on failure — the email has already gone.
 */
export async function markPackagesSent(leadId) {
  await api.sendPackages(leadId).catch(() => {});
  await api.setPackagesLock(leadId, true).catch(() => {});
}

/**
 * 📤 Send Packages — the button, its checks, the compose window (a vendor sees and can adjust what their client
 * receives) and what sending does. The lead page and the contract preview both use it (2026-11-05).
 * `packageCount`: the packages loaded on the lead. `onMessage(text)`: what to tell the vendor. `onSent()`: after a send.
 */
export default function SendPackagesButton({ lead, packageCount, onMessage, onSent, className, disabled }) {
  const [open, setOpen] = useState(false);
  function start() {
    if (!lead?.email) return onMessage('⚠️ This lead has no email address');
    if (!packageCount) return onMessage('⚠️ Load a package folder first');
    setOpen(true);
  }
  async function sent() {
    await markPackagesSent(lead.id);
    onSent?.();
    onMessage(`📤 Sent to ${lead.email}`);
  }
  return (
    <>
      <button type="button" className={className} onClick={start} disabled={disabled} title="Email these packages to the client">📤 Send Packages</button>
      {open && <SendPackagesModal lead={lead} link={`${clientBase()}/portal/${lead.client_token}`} onClose={() => setOpen(false)} onSent={sent} />}
    </>
  );
}
