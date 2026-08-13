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

/* A vendor on the free trial has no package — signup writes plan 'starter',
   which is not a package key. The trial's allowance therefore lives here rather
   than on a row, and it is small on purpose: a trial is for trying the product,
   not for delivering a season's weddings through. */
const TRIAL_LIMIT_MB = 5 * 1024;

/* Only reached if a vendor's plan names a package that no longer exists —
   deliberately small, so a broken plan shows up as a vendor who cannot upload
   much rather than one quietly handed the largest allowance in the system. */
const FALLBACK_LIMIT_MB = 1024;

/**
 * 📦 What a vendor is allowed, and where that number comes from.
 *
 * The package decides it. Raising a package's storage_gb in the super panel
 * raises it for every vendor on that package at once, which is the whole reason
 * it lives on the package rather than being copied onto each account at signup.
 *
 * vendor_settings.storage_limit_mb remains as an OVERRIDE and nothing else. A
 * super admin can grant one vendor more than their package — an apology, a
 * migration, a special case — without inventing a package for them. Null means
 * "just use the package", which is what almost every vendor should be.
 */
async function limitMbFor(vendorId) {
  const vendor = await prisma.vendors.findUnique({
    where: { id: Number(vendorId) },
    select: { plan: true, vendor_settings: { select: { storage_limit_mb: true } } },
  });
  const override = vendor?.vendor_settings?.storage_limit_mb;
  if (override != null) return { limitMb: override, source: 'override' };

  const key = vendor?.plan;
  if (!key || key === 'starter' || key === 'trial') {
    return { limitMb: TRIAL_LIMIT_MB, source: 'trial', planName: 'Free trial' };
  }

  const pkg = await prisma.packages.findFirst({
    where: { key },
    select: { storage_gb: true, name: true },
  });
  if (pkg) return { limitMb: pkg.storage_gb * 1024, source: 'package', planName: pkg.name };

  return { limitMb: FALLBACK_LIMIT_MB, source: 'fallback' };
}

export async function storageFor(vendorId) {
  const v = Number(vendorId);
  const [files, photos, limit] = await Promise.all([
    prisma.file_share_items.aggregate({
      where: { vendor_id: v },                          // 🔒 tenancy
      _sum: { size_bytes: true },
    }),
    prisma.photos.aggregate({
      where: { vendor_id: v },                          // 🔒 tenancy
      _sum: { size_bytes: true },
    }),
    limitMbFor(v),
  ]);

  const fileBytes = Number(files._sum.size_bytes || 0);
  const photoBytes = Number(photos._sum.size_bytes || 0);
  const usedBytes = fileBytes + photoBytes;
  const limitMb = limit.limitMb;
  const limitBytes = limitMb * 1024 * 1024;

  return {
    used_bytes: usedBytes,
    // broken out so a vendor asking "what is using my space?" can be answered
    used_files_bytes: fileBytes,
    used_photos_bytes: photoBytes,
    limit_bytes: limitBytes,
    limit_mb: limitMb,
    // so a vendor asking "why is my limit this?" can be told, and a super admin
    // can see at a glance whether an account is on its plan or an override
    limit_source: limit.source,
    plan_name: limit.planName || null,
    remaining_bytes: Math.max(limitBytes - usedBytes, 0),
    /* Worked out here rather than by each caller, so the bar in a vendor's
       sidebar and the figure in the super panel cannot disagree. Capped at 100
       because an override lowered below what is already stored would otherwise
       draw a bar past the end of its track. */
    percent: limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10) : 0,
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
