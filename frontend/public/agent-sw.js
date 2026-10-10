/* 🔔 iwopo AI Agent — the service worker behind the installed app and pop-ups.
 *
 * Registered only from the AI Agent tab (a vendor with the private feature), so
 * clients' browsers never get it. It shows pushed notices, opens the AI Agent
 * when one is tapped, and passes page loads straight to the network — Chrome
 * only offers "Install app" when a worker handles fetches. Nothing is cached:
 * the panel must always be live. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// page loads only, straight to the network; everything else is left to the browser
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request));
});

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
