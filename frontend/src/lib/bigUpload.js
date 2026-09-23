/**
 * 📦 Sending a large file straight to Cloudflare, in parts.
 *
 * The ordinary upload posts a file to this server, which then pushes it to R2.
 * That works to about two gigabytes and then stops: nginx refuses a bigger
 * body, and a single request that takes an hour gets dropped by something in
 * between long before it finishes.
 *
 * This instead asks the server for a signed URL per part and sends each one to
 * Cloudflare directly. Nothing large crosses the VPS, so size stops mattering —
 * a two hundred gigabyte delivery costs the server nothing but a few small
 * JSON calls.
 *
 * The caller supplies the endpoints, because a vendor uploading to their own
 * drive and a client sending something back through a share link are authorised
 * completely differently — one by a login, the other by the share token — but
 * the part-sending is identical and was otherwise going to be written twice.
 */

/* Four parts in flight at once. One at a time meant every part waited a full
   round trip to Cloudflare before the next began, so most of the upload was
   spent idle rather than sending. Four is deliberate: enough to keep the link
   busy, few enough that a modest connection is not swamped and a retry still
   has room to breathe. */
const CONCURRENCY = 4;

/* Three attempts per part. A part is the unit of failure here, so a blip costs
   one retry of sixty-four megabytes rather than the whole file. */
const ATTEMPTS = 3;

/**
 * @param {File}   file
 * @param {object} io        { begin, sign, complete, abort }
 * @param {object} [resume]  what the server already has — { upload_id, key,
 *                           part_size, done_parts }. When present, begin() is
 *                           skipped and only the missing parts are sent.
 */
export async function uploadInParts(file, io, onProgress, resume) {
  const begun = resume || await io.begin({
    size_bytes: file.size,
    filename: file.name,
    content_type: file.type || 'application/octet-stream',
  });

  const { upload_id: uploadId, key } = begun;
  const partSize = begun.part_size || 64 * 1024 * 1024;
  const total = Math.max(1, Math.ceil(file.size / partSize));

  /* Parts R2 already holds. Sending one again is not an error — it simply
     overwrites — but on a two hundred gigabyte upload that died at ninety per
     cent it is hours of somebody's evening for no reason. */
  const already = new Set(begun.done_parts || []);

  try {
    let done = already.size, next = 1, failed = null;
    if (already.size) onProgress?.(done, total, 'resuming');

    const sendPart = async (n) => {
      const blob = file.slice((n - 1) * partSize, n * partSize);
      const { url } = await io.sign({ key, upload_id: uploadId, part_number: n });
      let lastErr;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        try {
          const r = await fetch(url, { method: 'PUT', body: blob });
          if (!r.ok) throw new Error(`Part ${n} rejected (${r.status})`);
          return;
        } catch (err) {
          lastErr = err;
          /* A background tab clamps setTimeout to about once a minute, so a
             one-second backoff can become a sixty-second stall. Kept short
             deliberately — the delay is only there to let a blip pass. */
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      throw lastErr || new Error(`Part ${n} failed`);
    };

    const worker = async () => {
      while (!failed) {
        const n = next++;
        if (n > total) return;
        if (already.has(n)) continue;          // R2 already holds this part
        try { await sendPart(n); } catch (e) { failed = e; return; }
        onProgress?.(++done, total);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    if (failed) throw failed;

    return await io.complete({
      key, upload_id: uploadId,
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
    });
  } catch (err) {
    /* Abandoned parts keep costing storage until R2's own rule clears them
       after seven days, so a failure tidies up after itself rather than leaving
       the vendor paying for an upload that never finished. */
    try { await io.abort?.({ key, upload_id: uploadId }); } catch { /* best effort */ }
    throw err;
  }
}

/** Bytes a person can read, for progress text. */
export function humanSize(n) {
  const b = Number(n) || 0;
  if (b >= 1099511627776) return (b / 1099511627776).toFixed(2) + ' TB';
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576) return Math.round(b / 1048576) + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' KB';
}
