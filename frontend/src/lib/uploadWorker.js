// Runs the photo upload loop on a background thread so it keeps going when the
// tab is hidden (browsers throttle the main thread hard, workers far less).
// Messages IN:  { albumId, files:[File], eventId, token, maxCount }
// Messages OUT: { type:'progress', done, total }
//               { type:'chunk' }               // a chunk landed -> UI should refresh the grid
//               { type:'done', count }
//               { type:'error', message }

const MAX_BYTES = 80 * 1024 * 1024; // ~80MB per request (stay under proxy body limit)

self.onmessage = async (e) => {
  const { albumId, files, eventId, token, maxCount = 20 } = e.data;
  const list = [...files];
  const total = list.length;
  let done = 0;
  let i = 0;
  try {
    while (i < total) {
      // pack a chunk: add files until we hit the size cap or the count cap (always >= 1 file)
      const slice = [];
      let bytes = 0;
      while (i < total && slice.length < maxCount &&
             (slice.length === 0 || bytes + list[i].size <= MAX_BYTES)) {
        bytes += list[i].size;
        slice.push(list[i]);
        i++;
      }
      const fd = new FormData();
      slice.forEach(f => fd.append('photos', f));
      if (eventId) fd.append('event_id', eventId);

      const res = await fetch(`/api/albums/${albumId}/photos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

      done += slice.length;
      self.postMessage({ type: 'progress', done, total });
      self.postMessage({ type: 'chunk' });
    }
    self.postMessage({ type: 'done', count: total });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Upload failed' });
  }
};
