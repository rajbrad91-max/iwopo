// Runs the photo upload loop on a background thread so it keeps going when the
// tab is hidden (browsers throttle the main thread hard, workers far less).
// Messages IN:  { albumId, files:[File], eventId, token }
// Messages OUT: { type:'progress', done, total }
//               { type:'chunk' }               // photos landed -> UI should refresh the grid
//               { type:'done', count }
//               { type:'error', message }
//
// 🚀 STRAIGHT TO R2 (Raj, 2026-10-09: "uploading should happen first").
// Each photo goes from this browser directly to Cloudflare; our server only
// signs the permission (begin) and records it (complete), and makes the
// thumbnails afterwards in the background. Upload speed is then the vendor's
// own internet and nothing else — fifty vendors at once do not slow each other
// down on our CPU.
// If direct upload is not available (R2 not configured) it falls back to
// posting the files to the server, four requests at a time.

const PARALLEL = 6;                    // photos in flight at once — they no longer touch our CPU
const RELOAD_EVERY_MS = 3000;          // don't refetch the whole album for every photo
/* ⚠️ Patient retries. Two quick ones (1.5 s, 3 s) were not enough to ride out
   the server restarting — it takes ~10 s to come back — and an upload died at
   404 of 642 with "Upload failed (502)". These wait up to ~80 s in total, so a
   restart or a short network drop is invisible; a refusal (quota, no access)
   still stops at once. */
const BACKOFF_MS = [2000, 4000, 8000, 15000, 20000, 30000];

self.onmessage = async (e) => {
  const { albumId, files, eventId, token } = e.data;
  const list = [...files];
  const total = list.length;
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  const json = (url, body) => fetch(url, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  let direct = true;                   // until the server says otherwise
  let done = 0, next = 0, failed = null, lastReload = 0;

  const retrying = async (fn) => {
    for (let attempt = 0; ; attempt++) {
      try { return await fn(); }
      catch (err) {
        if (err.final || attempt >= BACKOFF_MS.length) throw err;
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));   // wait, then again
      }
    }
  };
  const fail = (msg) => Object.assign(new Error(msg), { final: true });

  /** One photo: permission → Cloudflare → recorded. */
  async function sendDirect(file) {
    const b = await retrying(async () => {
      const r = await json(`/api/albums/${albumId}/photos/begin`, { files: [{ name: file.name, size: file.size }] });
      if (r.status === 409 && r.data.error === 'direct_unavailable') throw Object.assign(new Error('fallback'), { fallback: true, final: true });
      if (r.status >= 500) throw new Error(r.data.error || `Upload failed (${r.status})`);
      if (r.status >= 400) throw fail(r.data.message || r.data.error || `Upload failed (${r.status})`);
      return r.data.items[0];
    });
    await retrying(async () => {
      /* file.slice() has no type, so no Content-Type header goes with it — the
         same request shape the film upload already sends to R2 successfully */
      const r = await fetch(b.url, { method: 'PUT', body: file.slice(0, file.size) });
      if (!r.ok) throw new Error(`Cloudflare refused ${file.name} (${r.status})`);
    }).catch((err) => { throw Object.assign(err, { cloudflare: true }); });
    await retrying(async () => {
      const r = await json(`/api/albums/${albumId}/photos/complete`, {
        items: [{ key: b.key, filename: file.name }], ...(eventId ? { event_id: eventId } : {}),
      });
      if (r.status >= 500) throw new Error(r.data.error || `Upload failed (${r.status})`);
      if (r.status >= 400) throw fail(r.data.message || r.data.errors?.[0] || r.data.error || `Upload failed (${r.status})`);
    });
  }

  /** The old way: the file goes to our server, which resizes and sends it on. */
  async function sendPosted(file) {
    await retrying(async () => {
      const fd = new FormData();
      fd.append('photos', file);
      if (eventId) fd.append('event_id', eventId);
      const res = await fetch(`/api/albums/${albumId}/photos`, { method: 'POST', headers: auth, body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return;
      if (res.status < 500) throw fail(data.message || data.error || `Upload failed (${res.status})`);
      throw new Error(data.error || `Upload failed (${res.status})`);
    });
  }

  async function lane() {
    while (!failed && next < total) {
      const file = list[next++];
      try {
        if (direct) {
          try { await sendDirect(file); }
          catch (err) {
            /* Falls back to posting through our server when direct upload is not
               set up — or when Cloudflare itself cannot be reached from this
               browser (a firewall, a missing CORS rule). A refusal from OUR
               server (quota, no access) is final and is not retried this way. */
            if (!err.fallback && !err.cloudflare) throw err;
            direct = false;
            await sendPosted(file);
          }
        } else {
          await sendPosted(file);
        }
      } catch (err) { failed = failed || err; return; }
      done++;
      self.postMessage({ type: 'progress', done, total });
      if (Date.now() - lastReload > RELOAD_EVERY_MS) { lastReload = Date.now(); self.postMessage({ type: 'chunk' }); }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, lane));
  if (failed) self.postMessage({ type: 'error', message: `${failed.message || 'Upload failed'} — ${done} of ${total} uploaded` });
  else self.postMessage({ type: 'done', count: total });
};
