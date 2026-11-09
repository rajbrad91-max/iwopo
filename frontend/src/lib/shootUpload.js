/**
 * 📸 A shoot's RAW + JPEG upload — straight from the browser to storage, a few files at a time (Raw Selector).
 * Shared by the photographer's portal (PhotographerPortal.jsx) and the vendor's own upload (ShootRail.jsx): each passes
 * its own begin/complete calls (/api/photographer/... or /api/rawsel/...), the files travel the same way.
 */
export const SHOOT_FILES = /\.(jpe?g|arw|cr2|cr3|nef|nrw|raf|orf|rw2|dng|pef|srw)$/i;
export const SHOOT_ACCEPT = '.jpg,.jpeg,image/jpeg,.arw,.cr2,.cr3,.nef,.nrw,.raf,.orf,.rw2,.dng,.pef,.srw';
const BATCH = 6;   // files per round trip; each file still goes straight to storage

/** upload these files; onProgress(text) as it goes — returns { done, failed } */
export async function uploadShootFiles(fileList, { begin, complete, onProgress }) {
  const files = [...fileList].filter(f => SHOOT_FILES.test(f.name));
  let done = 0; const failed = [];
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    onProgress?.(`Uploading ${done + 1}–${Math.min(done + batch.length, files.length)} of ${files.length}…`);
    try {
      const b = await begin(batch.map(f => ({ name: f.name, size: f.size })));
      const landed = [];
      for (const [k, it] of b.items.entries()) {
        const put = await fetch(it.url, { method: 'PUT', body: batch[k] });
        if (put.ok) landed.push({ key: it.key, name: batch[k].name });
        else failed.push(`${batch[k].name}: storage refused it (${put.status})`);
      }
      if (landed.length) {
        const c = await complete(landed);
        done += c.photos + c.raws;
        failed.push(...(c.errors || []));
      }
    } catch (x) { failed.push(...batch.map(f => `${f.name}: ${x.message}`)); }
  }
  return { done, failed };
}

/** one line for the page: what went up, and what did not */
export const uploadSummary = ({ done, failed }) => (failed.length
  ? `⚠️ ${done} uploaded, ${failed.length} not — ${failed.slice(0, 3).join(' · ')}`
  : `✅ ${done} file${done === 1 ? '' : 's'} uploaded`);
