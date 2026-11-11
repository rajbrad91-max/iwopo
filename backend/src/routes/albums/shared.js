/**
 * 📸 What several album routes share: where files live, the upload limits, and the gallery helpers.
 * Moved out of routes/albums.js unchanged (code audit #2, Raj 2026-11-11).
 */
import { GALLERIES_ROOT } from '../../config/paths.js';
import * as objects from '../../lib/objectStore.js';
import multer from 'multer';
import prisma from '../../config/prisma.js';
import bcrypt from 'bcryptjs';

export const ROOT = GALLERIES_ROOT;

/**
 * 🔒 The R2 key for one gallery file.
 *
 * Mirrors the folder shape on disk, vendor first. The vendor id comes from the
 * caller's token and the album id from a row already checked against it — never
 * from anything the request supplied, because the prefix is the only thing
 * separating one vendor's photographs from another's.
 */
export function galleryKey(vendorId, albumId, name) {
  return objects.keyFor(vendorId, 'galleries', String(albumId), name);
}

export const upload = multer({ dest: '/tmp/vf_uploads', limits: { fileSize: 200 * 1024 * 1024 } });

/**
 * 🔑 Two rules for gallery passwords, because one is shared by design and its
 * readable copy is kept for the vendor (see sealPassword):
 *
 *   1. A gallery password may not be the vendor's own account password —
 *      reuse would hand out account access with a wedding link.
 *   2. Four characters minimum. There was no floor at all, and albums existed
 *      whose password was the single character "1".
 */
export const MIN_GALLERY_PW = 4;

/** A typed password, trimmed; empty stays empty ("leave it as it is"). */
export function cleanPw(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * 🏷️ An album's category — shown to CLIENTS under the album name.
 * ⚠️ The browser auto-filled this box with the vendor's saved login email
 * (it took the box above the password fields for a username), and that email
 * then showed on the client's gallery index. Anything containing "@" is not a
 * category, so it is dropped rather than published.
 */
export function cleanCategory(v) {
  const s = String(v ?? '').trim().slice(0, 80);
  return s && !s.includes('@') ? s : null;
}

/**
 * An album as the panel should see it: no hashes and no sealed copies.
 * Readable passwords come only from GET /:id/passwords, on purpose — a list
 * of every album should not carry every password with it.
 */
export function publicAlbum(a) {
  if (!a) return a;
  const { guest_password, admin_password, guest_password_enc, admin_password_enc, ...rest } = a;
  void guest_password_enc; void admin_password_enc;
  return {
    ...rest,
    has_guest_password: !!guest_password,
    has_admin_password: !!admin_password,
  };
}

export async function checkGalleryPasswords(vendorId, values) {
  const given = values.filter(v => v != null && v !== '');
  if (!given.length) return null;

  /* ⚠️ Guest and admin must differ. The login tries admin first, so a shared
     password makes every guest an admin who can delete photographs. */
  if (given.length === 2 && String(given[0]).trim() === String(given[1]).trim()) {
    return 'Guest and admin passwords must be different';
  }

  for (const v of given) {
    if (String(v).trim().length < MIN_GALLERY_PW) {
      return `Gallery passwords need at least ${MIN_GALLERY_PW} characters`;
    }
  }

  /* Compared against the hash rather than a stored copy — the account password
     is not readable, and should not become readable to make this check easier. */
  const users = await prisma.users.findMany({
    where: { vendor_id: Number(vendorId) },       // 🔒 this vendor's logins only
    select: { password_hash: true },
  });
  for (const u of users) {
    if (!u.password_hash) continue;
    for (const v of given) {
      if (await bcrypt.compare(String(v), u.password_hash)) {
        /* ⚠️ Deliberately does NOT say WHY.
           Saying 'that is your account password' turns this form into a
           password oracle: anybody at the keyboard — a borrowed laptop, a
           session left open, somebody looking over a shoulder — could guess
           strings here and watch for that exact sentence to confirm the
           login. The refusal has to be indistinguishable from any other
           rejected password. */
        return 'Please choose a different password for this gallery';
      }
    }
  }
  return null;
}
