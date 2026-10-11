/**
 * 👀 Tester activity ping — TEMPORARY (see backend/src/routes/activity.js).
 * Every ~20 s while the tab is visible, and whenever the page changes, tell
 * the server which panel page this is. The server records it only for the
 * tracked tester; for everyone else it answers { track: false } and this stops.
 */
import { useEffect } from 'react';
import { api } from './api';

export function useActivityPing() {
  useEffect(() => {
    let stopped = false, lastPath = '', lastSent = 0;
    const send = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      lastPath = window.location.pathname; lastSent = Date.now();
      api.activityPing(lastPath).then(r => { if (!r || r.track !== true) stopped = true; }).catch(() => { stopped = true; });   // off on this server, or not tracked: stop
    };
    send();
    // cheap check every 2 s: a new page is sent at once, the same page every 20 s
    const t = setInterval(() => {
      if (window.location.pathname !== lastPath || Date.now() - lastSent >= 20_000) send();
    }, 2000);
    const onVis = () => { if (document.visibilityState === 'visible') send(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
}
