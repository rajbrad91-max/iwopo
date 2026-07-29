// Central storage-path config. STORAGE_BASE comes from the environment so that
// staging and production each keep their own photos/logos in isolated folders.
// Falls back to the live path when unset (so existing deploys keep working).
const BASE = process.env.STORAGE_BASE || '/var/www/iwopo/storage';

export const GALLERIES_ROOT = `${BASE}/galleries`;
export const LOGO_DIR = `${BASE}/logos`;
// 🌐 photos a vendor puts on their own website — cover and section images.
// Kept apart from galleries: those belong to a client's event and are governed
// by that album's sharing rules, while these are simply public web pages.
export const SITES_DIR = `${BASE}/sites`;

// 📤 File Flyer — files a vendor and their client pass between each other.
// Kept apart from galleries and sites for the same reason those are kept
// apart from each other: different access rules. A gallery is governed by its
// album's sharing settings, a site image is deliberately public, and these are
// private to one share token. When storage moves to B2/CDN this is the third
// prefix that needs its own bucket policy — private with signed URLs, like
// galleries, NOT public like sites.
export const FILES_DIR = `${BASE}/files`;
