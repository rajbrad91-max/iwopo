/* 🔔 iwopo AI Agent — the service worker behind pop-ups.
 *
 * Only registered by a vendor who switches pop-ups on in the AI Agent tab, so
 * clients' browsers never get it. It does two things: show a pushed notice,
 * and on a tap open (or bring forward) the AI Agent, ready to listen. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'iwopo', {
    body: d.body || '',
    icon: '/logo_icon.png',
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
