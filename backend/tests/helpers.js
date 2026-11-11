/**
 * 🧪 Shared set-up for iwopo's automated tests (Raj, 2026-11-11). Run with `npm test` in backend/.
 *
 * They test the running STAGING server and its database — never live: every file calls staging() first, which stops
 * the run unless the database is iwopo_staging. Each test cleans up what it creates. The sync to live (sync>iwopo)
 * runs them, and a failing test stops the sync.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const { default: prisma } = await import('../src/config/prisma.js');
const { signToken } = await import('../src/middleware/auth.js');
export { prisma };

/** 🛡️ stop at once unless this is staging */
export function staging() {
  if (!/\/iwopo_staging(\?|$)/.test(process.env.DATABASE_URL || '')) throw new Error('Tests run on staging only (DATABASE_URL is not iwopo_staging).');
}

export const API = `http://127.0.0.1:${process.env.PORT || 3002}/api`;

/** The test vendor (Muse Trial Test, vendor 31) and the super admin, signed in. */
export const TEST_VENDOR = 31;
const USER = { id: true, role: true, vendor_id: true, email: true, name: true };
export async function tokens() {
  const [vendor, admin] = await Promise.all([
    prisma.users.findFirst({ where: { vendor_id: TEST_VENDOR }, orderBy: { id: 'asc' }, select: USER }),
    prisma.users.findFirst({ where: { role: 'super_admin' }, select: USER }),
  ]);
  return { vendor: signToken(vendor), admin: signToken(admin) };
}

/** A request to the staging API: { status, body }. */
export async function call(method, path, { token, body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

/** Run `fn` with the test vendor's country set to `country`, putting the old one back afterwards. */
export async function asCountry(country, fn) {
  const { country: before } = await prisma.vendors.findUnique({ where: { id: TEST_VENDOR }, select: { country: true } });
  await prisma.vendors.update({ where: { id: TEST_VENDOR }, data: { country } });
  try { return await fn(); } finally { await prisma.vendors.update({ where: { id: TEST_VENDOR }, data: { country: before } }); }
}

/**
 * Run `fn` with the test vendor's email sending pointed at a server that does not exist, so a test that triggers an
 * email (a new-lead alert) never sends a real one; the vendor's own settings are put back afterwards.
 */
export async function noRealEmail(fn) {
  const before = await prisma.email_settings.findFirst({ where: { vendor_id: TEST_VENDOR } });
  const data = { mode: 'smtp', smtp_host: 'unreachable.example.test', smtp_port: 587, smtp_user: 'tests@example.test', smtp_pass: 'x',
    from_email: 'tests@example.test', notify_email: 'tests@example.test' };
  await prisma.email_settings.upsert({ where: { vendor_id: TEST_VENDOR }, update: data, create: { vendor_id: TEST_VENDOR, ...data } });
  try { return await fn(); } finally {
    if (before) {
      const keep = Object.fromEntries(Object.entries(before).filter(([k]) => k !== 'id' && k !== 'vendor_id'));
      await prisma.email_settings.update({ where: { vendor_id: TEST_VENDOR }, data: keep });
    } else await prisma.email_settings.delete({ where: { vendor_id: TEST_VENDOR } });
  }
}
