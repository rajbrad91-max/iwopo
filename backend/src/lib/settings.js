// read/write platform_settings (super-admin controls)
import { query } from '../config/db.js';

let cache = {};
let cacheAt = 0;

export async function getSetting(key, fallback = null) {
  const now = Date.now();
  if (now - cacheAt > 10000) { cache = {}; cacheAt = now; } // 10s cache
  if (cache[key] !== undefined) return cache[key];
  const { rows } = await query('SELECT value FROM platform_settings WHERE key=$1', [key]);
  const val = rows[0] ? rows[0].value : fallback;
  cache[key] = val;
  return val;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO platform_settings (key,value,updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, value]);
  cache[key] = value;
}

export async function getAllSettings() {
  const { rows } = await query('SELECT key,value FROM platform_settings');
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  return out;
}
