import { useEffect, useState } from 'react';

/**
 * 📤 Send Packages from the contract preview (2026-11-13).
 *
 * The preview is a client page: the vendor panel's styles are not on it, so it does not show the send window itself.
 * It hands over to the lead page, where the send window lives:
 *  - opened from the panel (Preview Contract opens a new tab), the preview tab closes and the panel opens the window;
 *  - opened any other way, the preview tab goes to the lead with ?send=packages and the window opens there.
 */
const MESSAGE = 'iwopo:send-packages';
const PARAM = 'send';

/** Why packages can't be sent yet, or '' when they can. */
export function whySendBlocked(lead, packageCount) {
  if (!lead?.email) return '⚠️ This lead has no email address';
  if (!packageCount) return '⚠️ Load a package folder first';
  return '';
}

/** The panel tab that opened this one, when it is still on the leads page. */
function openerPanel() {
  try {
    const w = window.opener;
    if (!w || w.closed || w.location.origin !== window.location.origin) return null;
    return w.location.pathname.startsWith('/panel/leads') ? w : null;
  } catch {
    return null;
  }
}

/** Ask the lead page to open the send window for this lead. */
export function goSendPackages(leadId) {
  const panel = openerPanel();
  if (panel) {
    panel.postMessage({ type: MESSAGE, leadId: String(leadId) }, window.location.origin);
    panel.focus();
    window.close();
    return;
  }
  window.location.assign(`/panel/leads/${leadId}?${PARAM}=packages`);
}

/** On the lead page: true once the contract preview asked for the send window. `done()` clears it. */
export function useSendPackagesRequest(leadId) {
  const [asked, setAsked] = useState(() => new URLSearchParams(window.location.search).get(PARAM) === 'packages');

  useEffect(() => {
    if (asked) window.history.replaceState(null, '', window.location.pathname);
  }, [asked]);

  useEffect(() => {
    if (!leadId) return undefined;
    const onMessage = (e) => {
      if (e.origin === window.location.origin && e.data?.type === MESSAGE && e.data.leadId === String(leadId)) setAsked(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [leadId]);

  return [asked, () => setAsked(false)];
}
