/**
 * 📒 What each vendor is actually storing.
 *
 * The quota used to be summed from photos.size_bytes and
 * file_share_items.size_bytes. That counted galleries and File Flyer correctly
 * and missed everything else: album covers — three objects apiece, belonging to
 * no row at all — website images, and vendor logos.
 *
 * Adding a size column to each of those tables would work until somebody adds a
 * ninth upload path and forgets. This records the bytes where the bytes are
 * actually written, inside putObject and the multipart completion, so a new
 * feature is counted whether or not its author thought about quotas.
 *
 * ⚠️ Recording must never break an upload. A vendor whose photograph failed
 * because the accounting row would not insert has lost something real over
 * something that can be recomputed — reconcile() rebuilds the whole ledger from
 * the bucket. So every function here swallows its errors.
 */
import prisma from '../config/prisma.js';

/** Every key is vendor/<id>/<prefix>/… — that prefix IS the tenancy wall. */
export function vendorFromKey(key) {
  const m = /^vendor\/(\d+)\//.exec(String(key || ''));
  return m ? Number(m[1]) : null;
}

/** Note an object that now exists. Safe to call twice for the same key. */
export async function recordObject(cls, key, bytes) {
  const vendor_id = vendorFromKey(key);
  if (!vendor_id || !Number.isFinite(Number(bytes))) return;
  try {
    await prisma.storage_objects.upsert({
      where: { cls_object_key: { cls: String(cls), object_key: String(key) } },
      update: { bytes: BigInt(Math.max(0, Math.round(Number(bytes)))) },   // a re-upload replaces
      create: {
        vendor_id, cls: String(cls), object_key: String(key),
        bytes: BigInt(Math.max(0, Math.round(Number(bytes)))),
      },
    });
  } catch { /* accounting must never break an upload — see reconcile() */ }
}

/** Note an object that has gone. */
export async function forgetObject(cls, key) {
  try {
    await prisma.storage_objects.deleteMany({ where: { cls: String(cls), object_key: String(key) } });
  } catch { /* the object is already gone; the row will be caught by reconcile */ }
}

/** Note a whole prefix going at once — deleting an album is hundreds of keys. */
export async function forgetPrefix(cls, prefix) {
  if (!prefix) return;
  try {
    await prisma.storage_objects.deleteMany({
      where: { cls: String(cls), object_key: { startsWith: String(prefix) } },
    });
  } catch { /* reconcile will catch it */ }
}

/** What this vendor is storing, in bytes. */
export async function ledgerBytesFor(vendorId) {
  try {
    const r = await prisma.storage_objects.aggregate({
      where: { vendor_id: Number(vendorId) },                 // 🔒 tenancy
      _sum: { bytes: true },
    });
    return Number(r._sum.bytes || 0);
  } catch { return 0; }
}

/**
 * 🔄 Rebuild the ledger from what is really in the buckets.
 *
 * The ledger is written best-effort, so it can drift — a failed insert, an
 * object deleted outside the app, a migration. This is the cure, and it is also
 * how the ledger is filled the first time. Reads the buckets rather than the
 * database, because the bucket is the thing being paid for.
 */
export async function reconcile(objects) {
  const seen = new Map();                                     // "cls\u0000key" → { vendor_id, cls, key, bytes }
  for (const cls of [objects.PRIVATE, objects.PUBLIC]) {
    let all;
    try { all = await objects.listAll(cls, 'vendor/'); }
    catch { continue; }                                       // a bucket we cannot read is left alone
    for (const o of all) {
      const vendor_id = vendorFromKey(o.key);
      if (!vendor_id) continue;
      seen.set(cls + '\u0000' + o.key, { vendor_id, cls, object_key: o.key, bytes: BigInt(Number(o.size || 0)) });
    }
  }

  const rows = [...seen.values()];
  await prisma.$transaction([
    prisma.storage_objects.deleteMany({}),
    ...(rows.length ? [prisma.storage_objects.createMany({ data: rows, skipDuplicates: true })] : []),
  ]);
  return { objects: rows.length, bytes: rows.reduce((n, r) => n + Number(r.bytes), 0) };
}
