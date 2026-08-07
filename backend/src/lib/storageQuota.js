/**
 * 📏 One pool per vendor.
 *
 * A vendor buys an amount of storage and fills it however they like — client
 * galleries, files passed to a couple, whatever. Counting only one of those
 * would make the number a vendor sees smaller than the space they are actually
 * using, which is worse than not showing a number at all.
 *
 * This used to live in files.js and counted only File Flyer, because File
 * Flyer was the only thing that recorded a size. Galleries record one now.
 *
 * What is deliberately NOT counted: website images and logos. Both are resized
 * hard on upload — a couple of hundred kilobytes each — and a vendor has a
 * handful, so they are noise against a pool measured in gigabytes. Counting
 * them would mean tracking a size per entry inside a JSON column for no
 * practical gain. If site media ever stops being small, that changes.
 */
import prisma from '../config/prisma.js';

const DEFAULT_LIMIT_MB = 1024;

export async function storageFor(vendorId) {
  const v = Number(vendorId);
  const [files, photos, settings] = await Promise.all([
    prisma.file_share_items.aggregate({
      where: { vendor_id: v },                          // 🔒 tenancy
      _sum: { size_bytes: true },
    }),
    prisma.photos.aggregate({
      where: { vendor_id: v },                          // 🔒 tenancy
      _sum: { size_bytes: true },
    }),
    prisma.vendor_settings.findUnique({
      where: { vendor_id: v },
      select: { storage_limit_mb: true },
    }),
  ]);

  const fileBytes = Number(files._sum.size_bytes || 0);
  const photoBytes = Number(photos._sum.size_bytes || 0);
  const usedBytes = fileBytes + photoBytes;
  const limitMb = settings?.storage_limit_mb ?? DEFAULT_LIMIT_MB;
  const limitBytes = limitMb * 1024 * 1024;

  return {
    used_bytes: usedBytes,
    // broken out so a vendor asking "what is using my space?" can be answered
    used_files_bytes: fileBytes,
    used_photos_bytes: photoBytes,
    limit_bytes: limitBytes,
    limit_mb: limitMb,
    remaining_bytes: Math.max(limitBytes - usedBytes, 0),
  };
}

/**
 * Would this upload fit? Returns null if it would, or the shape of a 413 if
 * it would not.
 *
 * Asked BEFORE anything is written. Accepting a file and then discovering it
 * does not fit leaves a vendor over their limit with no way back, and leaves
 * bytes on disk that nothing points at.
 */
export async function wouldExceed(vendorId, incomingBytes) {
  const st = await storageFor(vendorId);
  if (incomingBytes <= st.remaining_bytes) return null;
  return {
    error: 'over_quota',
    message: 'That would go over your storage limit.',
    storage: st,
  };
}
