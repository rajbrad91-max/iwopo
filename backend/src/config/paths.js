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
