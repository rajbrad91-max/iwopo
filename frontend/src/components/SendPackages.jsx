import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { clientBase } from '../lib/clientBase';
import SendPackagesModal from '../pages/SendPackagesModal.jsx';
import { whySendBlocked, useSendPackagesRequest } from '../lib/sendPackages';

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
 * receives) and what sending does. The lead page uses it; the contract preview hands over to it (lib/sendPackages.js).
 * `packageCount`: the packages loaded on the lead. `onMessage(text)`: what to tell the vendor. `onSent()`: after a send.
 */
export default function SendPackagesButton({ lead, packageCount, onMessage, onSent, className, disabled }) {
  const [open, setOpen] = useState(false);
  const [asked, doneAsking] = useSendPackagesRequest(lead?.id);
  function start() {
    const why = whySendBlocked(lead, packageCount);
    if (why) return onMessage(why);
    setOpen(true);
  }
  /* the contract preview asked for this window: open it once the packages have loaded */
  useEffect(() => {
    if (!asked || !packageCount || disabled) return;
    doneAsking();
    start();
  }, [asked, packageCount, disabled]); // eslint-disable-line react-hooks/exhaustive-deps
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
