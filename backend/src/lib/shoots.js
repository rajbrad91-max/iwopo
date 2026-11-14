import { renderEmail } from './emailTemplates.js';   // ✉️ the vendor's own wording
import crypto from 'node:crypto';
import path from 'node:path';
import prisma from '../config/prisma.js';
import * as objects from './objectStore.js';
import { hashSharePassword, sealPassword, openPassword } from './sharePassword.js';
import { isRaw, stemOf, rawKey, pairAlbum, deleteRaws } from './rawFiles.js';
import { wouldExceed } from './storageQuota.js';
import { recordObject } from './storageLedger.js';
import { enqueuePhotos } from './photoProcessor.js';
import { quiet } from './quiet.js';
import { tickStages } from './projectStages.js';

/**
 * 📸 Shoots — the Raw Selector's thread (Raj, 2026-11-09).
 *
 * A booking (a lead that was booked) is the thread from the inquiry to the finished gallery. When its photographer —
 * or the vendor — first uploads, the booking gets a SHOOT album (albums.kind = 'shoot', albums.lead_id = the booking):
 * the RAW + JPEG upload, where the client picks for the editor. A shoot is never listed in Galleries; the Raw Selector
 * rail shows it. Its title, the client's email and both passwords come from the booking, by the same rule the panel
 * uses when a gallery is made from a booking (VendorPanel pickBooking): guest = the vendor's prefix + the last four
 * digits of the client's phone, admin = the special prefix (or "admin" when the two would be the same) + those digits.
 *
 * The upload and the announcement live here, once, for both doors: the photographer's (routes/photographer.js) and the
 * vendor's own (routes/rawsel.js).
 */
export const SHOOT_KIND = 'shoot';
export const DELIVERY_KIND = 'delivery';   // a shoot's gallery-to-be while the editor uploads into it
const JPEG = /\.(jpe?g)$/i;
export const MAX_FILES = 20;                  // per request; the pages send batches
const MAX_JPEG = 100 * 1024 * 1024;
const MAX_RAW = 200 * 1024 * 1024;
const galleryKey = (v, albumId, name) => objects.keyFor(v, 'galleries', String(albumId), name);
const last4 = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length >= 4 ? d.slice(-4) : d; };

/** what a gallery made for this booking is called and opened with */
export async function bookingLogins(vendorId, lead) {
  const st = await prisma.album_settings.findUnique({ where: { vendor_id: vendorId }, select: { pw_prefix: true, spw_prefix: true } });
  const pre = (st?.pw_prefix || '').trim();
  const spre = (st?.spw_prefix || '').trim();
  /* no phone: a random tail, so the gallery still opens with something only the vendor and client are told */
  const tail = last4(lead.phone) || String(crypto.randomInt(1000, 10000));
  const guest = `${pre}${tail}`;
  const admin = `${spre && spre !== pre ? spre : 'admin'}${tail}`;
  return { title: (lead.name || 'Client').trim().slice(0, 160), client_email: lead.email || null, guest, admin: admin === guest ? `admin${guest}` : admin };
}

/** the fields of a new album for this booking: kind, booking, title, email and both passwords (stored as the gallery does) */
export async function bookingAlbumData(vendorId, lead, kind) {
  const l = await bookingLogins(vendorId, lead);
  return {
    vendor_id: vendorId, kind, lead_id: lead.id, title: l.title,
    category: (lead.event_type || '').trim().slice(0, 80) || null,
    client_email: l.client_email,
    guest_password: await hashSharePassword(l.guest), guest_password_enc: sealPassword(l.guest),
    admin_password: await hashSharePassword(l.admin), admin_password_enc: sealPassword(l.admin),
    public_token: crypto.randomBytes(16).toString('hex'),
    gallery_mode: 'per_client',
  };
}

/** the booking's shoot album, made the first time anyone uploads for it (with one tab, "Photos") */
export async function shootFor(vendorId, leadId) {
  const lead = await prisma.leads.findFirst({ where: { id: leadId, vendor_id: vendorId }, select: { id: true, name: true, email: true, phone: true, event_type: true } });   // 🔒
  if (!lead) return null;
  const have = await prisma.albums.findFirst({ where: { vendor_id: vendorId, lead_id: lead.id, kind: SHOOT_KIND }, orderBy: { id: 'asc' } });
  if (have) return have;
  const album = await prisma.albums.create({ data: await bookingAlbumData(vendorId, lead, SHOOT_KIND) });
  await prisma.album_events.create({ data: { album_id: album.id, vendor_id: vendorId, name: 'Photos', sort_order: 0 } });
  return album;
}

/** may these files be uploaded? JPEG or camera RAW, with a size, within the limits and the vendor's storage.
 *  Returns null when they may, or { status, error } for a route to answer with. */
export async function checkUpload(v, files) {
  if (!files.length) return { status: 400, error: 'No files' };
  for (const f of files) {
    const name = String(f?.name || 'A file').slice(0, 80);
    const raw = isRaw(f?.name);
    if (!raw && !JPEG.test(String(f?.name || ''))) return { status: 400, error: `${name} is not a JPEG or a camera RAW file` };
    const size = Number(f?.size);
    if (!Number.isFinite(size) || size <= 0) return { status: 400, error: 'Every file needs its size' };
    if (size > (raw ? MAX_RAW : MAX_JPEG)) return { status: 413, error: `${name} is too big` };
  }
  const over = await wouldExceed(v, files.reduce((n, f) => n + Number(f.size), 0));
  return over ? { status: 413, ...over } : null;
}

/** where a file of this shoot is stored: a RAW held aside, a JPEG as one of the shoot's photos */
export function uploadKey(v, album, name) {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return isRaw(name)
    ? rawKey(v, album.id, `${stamp}_${path.basename(String(name)).replace(/[^\w.-]+/g, '_').slice(-120)}`)
    : galleryKey(v, album.id, `${stamp}_orig${path.extname(String(name)).toLowerCase() || '.jpg'}`);
}

/** upload addresses — straight from the browser to storage. Returns { items } or { status, error }. */
export async function uploadBegin(v, album, files) {
  const list = Array.isArray(files) ? files.slice(0, MAX_FILES) : [];
  const bad = await checkUpload(v, list);
  if (bad) return bad;
  const items = [];
  for (const f of list) {
    const key = uploadKey(v, album, f.name);
    items.push({ name: f.name, key, url: await objects.signPut(objects.PRIVATE, key, Number(f.size)) });
  }
  return { items };
}

/** record what landed: JPEGs become the shoot's photos (previews made next), RAWs are paired to them by name */
export async function uploadComplete(v, album, items, who = null) {
  const tab = await prisma.album_events.findFirst({ where: { album_id: album.id }, orderBy: { sort_order: 'asc' }, select: { id: true } });
  const list = Array.isArray(items) ? items.slice(0, MAX_FILES) : [];
  const created = []; let raws = 0; const errors = [];
  for (const it of list) {
    const leaf = path.basename(String(it?.key || ''));
    const raw = isRaw(leaf);
    // 🔒 rebuilt from the vendor and this shoot: any other key is refused
    if (!leaf || it.key !== (raw ? rawKey(v, album.id, leaf) : galleryKey(v, album.id, leaf)) || (!raw && !/_orig\.jpe?g$/i.test(leaf))) { errors.push('Not your file'); continue; }
    const head = await objects.headObject(objects.PRIVATE, it.key);
    if (!head) { errors.push(`${String(it.name || leaf).slice(0, 80)} did not arrive`); continue; }
    const size = Number(head.size || 0);
    await recordObject(objects.PRIVATE, it.key, size).catch(quiet('shoots · recordObject'));
    const filename = path.basename(String(it.name || leaf)).slice(0, 200);
    if (raw) {
      const stem = stemOf(filename);
      const old = await prisma.raw_files.findUnique({ where: { album_id_stem: { album_id: album.id, stem } } });
      if (old && old.object_key !== it.key) await deleteRaws({ id: old.id });
      await prisma.raw_files.upsert({
        where: { album_id_stem: { album_id: album.id, stem } },
        create: { vendor_id: v, album_id: album.id, filename, stem, object_key: it.key, size_bytes: BigInt(size) },
        update: { filename, object_key: it.key, size_bytes: BigInt(size) },
      });
      raws++;
      continue;
    }
    const base = leaf.replace(/_orig\.[^.]+$/, '');
    const row = await prisma.photos.create({
      data: {
        album_id: album.id, vendor_id: v, event_id: tab?.id ?? null, filename, storage_path: `${v}/${album.id}/${leaf}`,
        preview_path: `${v}/${album.id}/${base}_full.webp`, thumb_path: `${v}/${album.id}/${base}_thumb.webp`,
        size_bytes: BigInt(size), ready: false,
      },
      select: { id: true },
    });
    created.push(row.id);
  }
  enqueuePhotos(created);
  await pairAlbum(album.id, v);
  if (created.length + raws) {
    // 🛤️ the rail's "Uploaded": who, the first time — and the PPM board's "Copied"
    if (who) await prisma.albums.updateMany({ where: { id: album.id, uploaded_by: null }, data: { uploaded_by: String(who).slice(0, 80) } });
    await tickStages(v, album.lead_id, ['backed_up_at']);
  }
  return { photos: created.length, raws, errors };
}

/** all uploaded: the owner's bell + email — and, if asked, the client (their link and both passwords).
 *  `notify` and `sendAsVendor` are passed in: they live in route modules (routes/notifications.js, routes/email.js). */
export async function announceUpload({ v, album, who, client, appUrl, notify, sendAsVendor }) {
  const counts = { photos: await prisma.photos.count({ where: { album_id: album.id } }), raws: await prisma.raw_files.count({ where: { album_id: album.id } }) };
  if (!counts.photos) return { status: 400, error: 'Upload the photos first' };
  await prisma.albums.update({ where: { id: album.id }, data: { uploaded_at: new Date() } });
  await notify(v, `📸 ${album.title}: ${counts.photos} photos uploaded`, `${who} uploaded ${counts.photos} JPEGs and ${counts.raws} RAWs.`, 'info', '/panel/rawsel');
  const ven = await prisma.vendors.findUnique({ where: { id: v }, select: { business_name: true, email: true } });
  const studio = ven?.business_name || 'Your photographer';
  let ownerEmailed = false, clientEmailed = false;
  if (ven?.email) {
    ownerEmailed = (await sendAsVendor(v, { to: ven.email, subject: `📸 ${album.title}: photos uploaded`, text: `${who} uploaded ${counts.photos} JPEGs and ${counts.raws} RAWs for ${album.title}.\n\nRaw Selector: ${appUrl}/panel/rawsel` })).ok;
  }
  if (client && album.client_email) {
    const mail = await renderEmail(v, 'photos_ready', {   // ✉️ Settings → Email templates
      client_name: album.title, gallery_name: album.title, business_name: studio,
      link: `${appUrl}/g/${album.public_token}`,
      view_password: openPassword(album.guest_password_enc) || '(ask us)',
      pick_password: openPassword(album.admin_password_enc) || '(ask us)',
    });
    clientEmailed = (await sendAsVendor(v, { to: album.client_email, subject: mail.subject, text: mail.body, html: mail.html })).ok;
  }
  return { ok: true, ownerEmailed: !!ownerEmailed, clientEmailed: !!clientEmailed };
}

/** 📧 a client's picks are in and this album has RAWs: email every editor of the vendor (not removed) where to find
 *  them. `sendAsVendor` is passed in, as above. Returns how many were emailed. */
export async function tellEditors({ v, album, count, appUrl, sendAsVendor }) {
  if (!await prisma.raw_files.count({ where: { album_id: album.id } })) return 0;   // a plain gallery never reaches the editor
  const editors = await prisma.raw_editors.findMany({ where: { vendor_id: v, revoked_at: null }, select: { email: true, name: true } });
  const studio = (await prisma.vendors.findUnique({ where: { id: v }, select: { business_name: true } }))?.business_name || 'The studio';
  let sent = 0;
  for (const ed of editors) {
    const ok = (await sendAsVendor(v, {
      to: ed.email,
      subject: `🎞️ New photos to edit — ${album.title}`,
      text: `Hi${ed.name ? ` ${ed.name}` : ''},\n\n${album.title} picked ${count} photo${count === 1 ? '' : 's'}. Their RAW files are ready for you:\n${appUrl}/editor\n\n${studio}`,
    })).ok;
    if (ok) sent++;
  }
  return sent;
}

/** the shoot's gallery-to-be or gallery if the editor has begun one — only looked for, never made (an older album
 *  that is not a shoot is its own). Looking must not leave an empty album behind. */
export async function findDelivery(v, album) {
  if (album.kind !== SHOOT_KIND) return album;
  return prisma.albums.findFirst({ where: { vendor_id: v, source_album_id: album.id, kind: { in: [DELIVERY_KIND, 'gallery'] } }, orderBy: { id: 'asc' } });
}

/** 📁 where the editor's folders go (Raj, 2026-11-09). A shoot delivers into its own gallery-to-be — kind 'delivery',
 *  hidden while the editor uploads — with the shoot's name, the client's email and the same two passwords (from the
 *  booking). When the editor sends it, it becomes a gallery like any other (routes/editor.js). An older gallery that
 *  is not a shoot delivers into itself, as before. */
export async function deliveryFor(v, album) {
  const have = await findDelivery(v, album);
  if (have) return have;
  const s = await prisma.albums.findUnique({
    where: { id: album.id },
    select: { title: true, category: true, client_email: true, lead_id: true, guest_password: true, guest_password_enc: true, admin_password: true, admin_password_enc: true },
  });
  return prisma.albums.create({
    data: {
      ...s, vendor_id: v, kind: DELIVERY_KIND, source_album_id: album.id, gallery_mode: 'per_client',
      public_token: crypto.randomBytes(16).toString('hex'),
    },
  });
}

/** 🏷️ rename a shoot along the way (vendor, photographer or editor): the name travels to its gallery-to-be or gallery.
 *  An older album that is not a shoot is renamed itself. Returns the new name, or null when it is not a usable one. */
export async function renameShoot(v, album, name) {
  const title = String(name || '').trim().slice(0, 160);
  if (!title) return null;
  await prisma.albums.updateMany({ where: { vendor_id: v, OR: [{ id: album.id }, { source_album_id: album.id }] }, data: { title } });   // 🔒 this vendor
  return title;
}

/** 🖼️ a 15-minute link to one of a gallery's images by its stored path (`<vendor>/<album>/<file>`), to look at only */
export async function imageLink(v, rel, name) {
  const parts = String(rel || '').split('/').filter(Boolean);
  if (parts.length < 3) return null;
  return objects.signGet(objects.PRIVATE, objects.keyFor(v, 'galleries', parts[1], parts[2]), name).catch(() => null);
}

/** 📥 the RAWs reached the editor — the editor's first download, or the vendor's own (they can be the editor): the
 *  rail's "Editor received" (who, the first time) and the PPM board's "To editor" */
export async function markReceived(v, albumId, who) {
  const a = await prisma.albums.findFirst({ where: { id: albumId, vendor_id: v }, select: { id: true, lead_id: true, raws_received_at: true } });   // 🔒
  if (!a) return;
  if (!a.raws_received_at) await prisma.albums.update({ where: { id: a.id }, data: { raws_received_at: new Date(), raws_received_by: String(who || '').slice(0, 80) || null } });
  await tickStages(v, a.lead_id, ['sent_to_editor_at']);
}

