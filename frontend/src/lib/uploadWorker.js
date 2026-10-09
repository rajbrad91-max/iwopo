// Runs the photo upload loop on a background thread so it keeps going when the
// tab is hidden (browsers throttle the main thread hard, workers far less).
// Messages IN:  { albumId, files:[File], eventId, token, maxCount }
// Messages OUT: { type:'progress', done, total }
//               { type:'chunk' }               // photos landed -> UI should refresh the grid
//               { type:'done', count }
//               { type:'error', message }
//
// 🚀 PARALLEL, not one request at a time (2026-10-09).
// Measured on a real upload: each 9-photo request spent ~47 s crossing the
// network and then ~16 s being processed, and while the server worked the
// connection sat idle — nothing was sent until the whole batch had finished.
// The old Laravel site used 10 parallel uploads of one file each. Now several
// small requests are in flight at once, so the network is always busy and the
// server's processing happens underneath it.

const PARALLEL = 4;                    // requests in flight at once
const PER_REQUEST = 2;                 // photos per request — small, so they overlap well
const MAX_BYTES = 60 * 1024 * 1024;    // and never a huge body (proxy limits, retries)
const RELOAD_EVERY_MS = 3000;          // don't refetch the whole album for every 2 photos
const RETRIES = 2;                     // a dropped connection should not end a 500-photo upload

self.onmessage = async (e) => {
  const { albumId, files, eventId, token, maxCount = PER_REQUEST } = e.data;
  const list = [...files];
  const total = list.length;
  const per = Math.max(1, Math.min(maxCount, PER_REQUEST));

  // pack the requests up front: count cap and size cap, always >= 1 file
  const chunks = [];
  for (let i = 0; i < total;) {
    const slice = [];
    let bytes = 0;
    while (i < total && slice.length < per && (slice.length === 0 || bytes + list[i].size <= MAX_BYTES)) {
      bytes += list[i].size; slice.push(list[i]); i++;
    }
    chunks.push(slice);
  }

  let done = 0, next = 0, failed = null, lastReload = 0;

  async function send(slice) {
    for (let attempt = 0; ; attempt++) {
      try {
        const fd = new FormData();
        slice.forEach(f => fd.append('photos', f));
        if (eventId) fd.append('event_id', eventId);
        const res = await fetch(`/api/albums/${albumId}/photos`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) return;
        // a refusal (over quota, no access) will not change on a retry
        if (res.status < 500 || attempt >= RETRIES) throw Object.assign(new Error(data.message || data.error || `Upload failed (${res.status})`), { final: true });
      } catch (err) {
        if (err.final || attempt >= RETRIES) throw err;
      }
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));   // brief back-off, then again
    }
  }

  async function lane() {
    while (!failed && next < chunks.length) {
      const slice = chunks[next++];
      try { await send(slice); }
      catch (err) { failed = failed || err; return; }
      done += slice.length;
      self.postMessage({ type: 'progress', done, total });
      if (Date.now() - lastReload > RELOAD_EVERY_MS) { lastReload = Date.now(); self.postMessage({ type: 'chunk' }); }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, lane));
  if (failed) self.postMessage({ type: 'error', message: `${failed.message || 'Upload failed'} — ${done} of ${total} uploaded` });
  else self.postMessage({ type: 'done', count: total });
};
