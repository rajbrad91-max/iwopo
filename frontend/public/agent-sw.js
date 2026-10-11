/* 🔔 iwopo AI Agent — the service worker behind pop-ups.
 *
 * Registered from the AI Agent tab (a vendor with the private feature). It
 * shows pushed notices and opens the AI Agent when one is tapped.
 *
 * It has NO fetch handler on purpose (2026-10-11): it used to pass every page
 * load through itself so Chrome would offer "Install app" — and a worker that
 * answers page loads takes away the browser's "keep the old page up until the
 * new one is ready", so every refresh on the whole site flashed a blank, dark
 * frame. Tornado is a real Android app now; the web install is not needed. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'iwopo', {
    body: d.body || '',
    icon: '/agent-192.png',
    badge: '/favicon-32.png',
    data: { url: d.url || '/panel/agent?voice=1' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/panel/agent?voice=1', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // an open panel tab: bring it forward and move it to the AI Agent
    for (const w of wins) {
      if (new URL(w.url).pathname.startsWith('/panel')) { await w.focus(); return w.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
