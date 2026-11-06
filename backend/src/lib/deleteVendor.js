import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { paidSubscription } from './billing.js';
import { disconnect } from './stripeConnect.js';

/**
 * 🗑️ Delete a vendor for good (Super Admin, Raj, 2026-11-06). Never an owner account; never one with a live Stripe
 * subscription (cancel it first). Their Stripe is disconnected, their stored photos and files are removed from storage,
 * and the account with everything it holds is deleted: 58 kinds of record go with the vendor through the database; the
 * few with no link (galleries and through them their photos, faces and folders, gallery settings and theme, support
 * messages, stored-file records) are removed here first. The security log is kept — it is the audit trail.
 */
const UNLINKED = ['album_settings', 'gallery_theme', 'support_messages', 'storage_objects'];

export async function deletePreview(vendorId) {
  const v = Number(vendorId);
  const vendor = await prisma.vendors.findUnique({ where: { id: v }, select: { id: true, business_name: true, billing_exempt: true } });
  if (!vendor) return null;
  const where = { vendor_id: v };                                                   // 🔒 this vendor
  const [users, leads, contracts, payments, galleries, photos, files, sub] = await Promise.all([
    prisma.users.count({ where }), prisma.leads.count({ where }), prisma.contracts.count({ where }), prisma.payments.count({ where }),
    prisma.albums.count({ where }), prisma.photos.count({ where: { albums: { vendor_id: v } } }), prisma.file_share_items.count({ where }),
    paidSubscription(v),
  ]);
  const blocked = vendor.billing_exempt ? 'This is an owner account — it can never be deleted.'
    : sub ? 'This vendor has an active Stripe subscription — cancel it first.' : null;
  return { id: v, business_name: vendor.business_name, blocked, counts: { logins: users, leads, contracts, payments, galleries, photos, files } };
}

export async function deleteVendor(vendorId, confirmName) {
  const p = await deletePreview(vendorId);
  const no = (status, message) => Object.assign(new Error(message), { status });
  if (!p) throw no(404, 'No such vendor');
  if (p.blocked) throw no(409, p.blocked);
  if (String(confirmName || '').trim().toLowerCase() !== String(p.business_name || '').trim().toLowerCase()) throw no(400, 'Type the business name exactly to confirm.');
  const v = p.id;
  await disconnect(v).catch(() => {});                                              // 💳 their own Stripe, if connected
  await prisma.$transaction([
    prisma.albums.deleteMany({ where: { vendor_id: v } }),                          // photos, faces, folders cascade
    ...UNLINKED.map(t => prisma[t].deleteMany({ where: { vendor_id: v } })),
    prisma.vendors.delete({ where: { id: v } }),                                    // everything linked to the vendor
  ]);
  removeStoredFiles(v);                                                             // in the background — Super Admin is answered now
  return p.counts;
}

/** The deleted vendor's photos and files in storage, removed after the answer (a large account takes minutes). */
function removeStoredFiles(v) {
  (async () => {
    for (const cls of [objects.PRIVATE, objects.PUBLIC]) {
      const keys = await objects.listAll(cls, `vendor/${v}/`).catch(() => []);
      for (const k of keys) await objects.deleteObject(cls, k.key || k).catch(() => {});
    }
  })().catch(e => console.error(`[deleteVendor] storage clean-up for vendor ${v}:`, e.message));
}
