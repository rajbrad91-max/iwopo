import { useState, useEffect } from 'react';
import { api } from './api';

/** 🔴 Unread counts for the private inbox — the sidebar number and the tab badges share this.
 *  Refreshes every 30 seconds, and at once whenever something is read (inboxChanged()). */
export const inboxChanged = () => window.dispatchEvent(new Event('inbox:changed'));

export function useInboxCounts(enabled = true) {
  const [c, setC] = useState({ calls: 0, email: 0, instagram: 0, whatsapp: 0, total: 0 });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () => api.inboxCounts().then(d => { if (alive) setC(d); }).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    const soon = () => setTimeout(load, 600);
    window.addEventListener('inbox:changed', soon);
    return () => { alive = false; clearInterval(t); window.removeEventListener('inbox:changed', soon); };
  }, [enabled]);
  return c;
}
