/**
 * 🧹 Uploads that were started and then abandoned.
 *
 * A vendor begins a large upload, sends a few parts, and closes the laptop for
 * good. Two things are left behind: a row in pending_uploads, and the parts
 * themselves sitting in R2 costing storage.
 *
 * Both have to go, and the order matters: cancel at Cloudflare FIRST, then drop
 * the row. Deleting the row first loses the only record of which upload to
 * cancel, and the parts become unreachable rubbish that nothing will ever
 * clean.
 *
 * ⚠️ The first version of this assumed Cloudflare's documented seven-day
 * auto-abort and simply deleted rows older than eight days without cancelling.
 * A test with a ten-day-old row proved the parts were STILL there afterwards —
 * the row was gone, so nothing could ever cancel them again. The rule may well
 * exist; an object token cannot read bucket configuration to confirm it, and a
 * default nobody can verify is not something to orphan storage on the strength
 * of. Every row is cancelled now, whatever its age. Cancelling an upload that
 * has already gone simply throws, which costs one caught exception.
 *
 * Two days is the threshold: old enough that nobody is coming back to it, and
 * far beyond any upload still in progress, whose row is minutes old rather than
 * days.
 */
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';

const ABANDONED_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export async function sweepAbandonedUploads() {
  let swept = 0, alreadyGone = 0;
  try {
    const stale = await prisma.pending_uploads.findMany({
      where: { created_at: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } },
      select: { id: true, object_key: true, upload_id: true },
    });

    for (const u of stale) {
      try {
        await objects.abortMultipart(objects.PRIVATE, u.object_key, u.upload_id);
      } catch {
        /* Already cancelled, or expired at Cloudflare — either way there is
           nothing left to charge for, and the row should still go. */
        alreadyGone++;
      }
      await prisma.pending_uploads.delete({ where: { id: u.id } }).catch(() => {});
      swept++;
    }

    if (swept) {
      console.log('[uploads] swept', swept, 'abandoned', alreadyGone ? `(${alreadyGone} already gone at R2)` : '');
    }
  } catch (e) {
    console.error('[uploads] sweep failed:', e.message);
  }
  return { swept, alreadyGone };
}
