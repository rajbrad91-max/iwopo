import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { paidSubscription } from './billing.js';
import { disconnect } from './stripeConnect.js';
import { stripe } from './stripe.js';
import { quiet } from './quiet.js';
import fs from 'fs';
import path from 'path';
import { FILES_DIR, GALLERIES_ROOT } from '../config/paths.js';

/**
 * 🗑️ Delete a vendor for good (Super Admin, Raj, 2026-11-06). Never an owner account. A paying vendor's Stripe
 * subscription is cancelled first, and only when Super Admin ticks that it should be (2026-11-07) — never silently. Their Stripe is disconnected, their stored photos and files are removed from storage,
 * and the account with everything it holds is deleted: every kind of record goes with the vendor through the
 * database's foreign keys (the last ten — galleries, photos, faces, gallery settings and theme, lead packages, support
 * messages, stored-file records — were linked 2026-11-14).
 */

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
  const blocked = vendor.billing_exempt ? 'This is an owner account — it can never be deleted.' : null;
  const planName = sub?.plan_id ? (await prisma.plans.findUnique({ where: { id: sub.plan_id }, select: { name: true } }))?.name : null;
  const paying = sub?.stripe_subscription_id ? { plan: planName || 'a paid plan' } : null;   // 💳 cancelled first, if ticked
  return { id: v, business_name: vendor.business_name, blocked, paying, counts: { logins: users, leads, contracts, payments, galleries, photos, files } };
}

export async function deleteVendor(vendorId, confirmName, { cancelSubscription = false } = {}) {
  const p = await deletePreview(vendorId);
  const no = (status, message) => Object.assign(new Error(message), { status });
  if (!p) throw no(404, 'No such vendor');
  if (p.blocked) throw no(409, p.blocked);
  if (String(confirmName || '').trim().toLowerCase() !== String(p.business_name || '').trim().toLowerCase()) throw no(400, 'Type the business name exactly to confirm.');
  const v = p.id;
  if (p.paying) {
    if (!cancelSubscription) throw no(409, 'This vendor pays by Stripe — tick "cancel their subscription" to delete them.');
    const sub = await paidSubscription(v);
    await stripe('DELETE', `/subscriptions/${sub.stripe_subscription_id}`);     // billing stops today, no refund
  }
  await disconnect(v).catch(quiet('disconnect a deleted vendor’s Stripe'));                                        // 💳 their own Stripe, if connected
  await prisma.vendors.delete({ where: { id: v } });                               // everything of theirs goes with it
  removeStoredFiles(v);                                                             // in the background — Super Admin is answered now
  return p.counts;
}

/** The deleted vendor's photos and files in storage, removed after the answer (a large account takes minutes) — and
 *  their folders on this server's own disk too (File Flyer thumbnails, gallery working copies): the stress test of
 *  2026-11-20 found those left behind after the bucket was emptied. */
function removeStoredFiles(v) {
  (async () => {
    for (const dir of [path.join(FILES_DIR, String(v)), path.join(GALLERIES_ROOT, String(v))]) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(quiet('remove a deleted vendor’s folder on disk'));
    }
    for (const cls of [objects.PRIVATE, objects.PUBLIC]) {
      const keys = await objects.listAll(cls, `vendor/${v}/`).catch(() => []);
      for (const k of keys) await objects.deleteObject(cls, k.key || k).catch(quiet('remove a deleted vendor’s stored file'));
    }
  })().catch(e => console.error(`[deleteVendor] storage clean-up for vendor ${v}:`, e.message));
}
