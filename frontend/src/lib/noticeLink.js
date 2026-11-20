/**
 * 🔔 Where a bell notice leads (Raj, 2026-11-15) — ONE answer, used by the bell (is the row clickable?) and by the
 * panel (go there). A notice the bell cannot follow stays plain text, never a button that does nothing.
 * Record links carry an id (a lead, a gallery); page links name the panel page (backend: notify() in
 * routes/notifications.js).
 */
const PAGES = new Set(['aichat', 'occasions', 'plans', 'services', 'settings', 'rawsel', 'galleries', 'agent']);

export function noticeTarget(n) {
  switch (n.link_type) {
    case 'lead': return n.link_id ? { tab: 'leads', lead: String(n.link_id) } : null;
    case 'album': return n.link_id ? { tab: 'galleries', album: String(n.link_id) } : null;
    case 'occasion': return { tab: 'occasions' };
    case 'folder': return { tab: 'fileflyer' };          // File Flyer, then that folder (handed over by the panel)
    case 'comms': case 'email': return { tab: 'comms' };
    default: return PAGES.has(n.link_type) ? { tab: n.link_type } : null;
  }
}

/** Hand a notice's detail to the page it opens: kept in sessionStorage (the page may be about to load) and announced
 *  as an event of the same name (it may already be open). The page takes it once. */
export function handOver(key, value = '') {
  sessionStorage.setItem(key, value);
  window.dispatchEvent(new CustomEvent(key));
}
export function takeHandOver(key) {
  const v = sessionStorage.getItem(key);
  if (v !== null) sessionStorage.removeItem(key);
  return v;
}
