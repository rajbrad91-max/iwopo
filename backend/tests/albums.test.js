/**
 * 📸 Galleries (routes/albums.js and the client's side, routes/galleryPublic.js) — the flow every client delivery
 * takes: make an album, upload a photo, the client opens the link and signs in, then delete. Written before
 * albums.js is split into smaller files (code audit #2, Raj 2026-11-11), so the split has to keep all of it working.
 * The test album is deleted afterwards, files included.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prisma, staging, tokens, call, API, TEST_VENDOR } from './helpers.js';

staging();
const { default: sharp } = await import('sharp');
const { GALLERIES_ROOT } = await import('../src/config/paths.js');
const t = await tokens();
const other = await (async () => {      // a vendor who is not the test vendor, for the tenancy wall
  const { signToken } = await import('../src/middleware/auth.js');
  const u = await prisma.users.findFirst({ where: { vendor_id: 1 }, orderBy: { id: 'asc' }, select: { id: true, role: true, vendor_id: true, email: true, name: true } });
  return signToken(u);
})();
const TITLE = 'iwopo-tests album';
const GUEST = 'Iwopo-Tests-Guest-7391';
let album = null, photoId = null;

after(async () => {
  for (const a of await prisma.albums.findMany({ where: { vendor_id: TEST_VENDOR, title: { startsWith: TITLE } }, select: { id: true } })) {
    await call('DELETE', `/albums/${a.id}`, { token: t.vendor });
  }
  await prisma.$disconnect();
});

test('a vendor makes an album', async () => {
  const r = await call('POST', '/albums', { token: t.vendor, body: { title: TITLE, category: 'Wedding', guest_password: GUEST } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  album = await prisma.albums.findFirst({ where: { vendor_id: TEST_VENDOR, title: TITLE }, select: { id: true, public_token: true } });
  assert.ok(album?.public_token, 'it has a private link');
});

test('it is in the vendor’s list, and opens', async () => {
  const list = await call('GET', '/albums', { token: t.vendor });
  assert.equal(list.status, 200);
  assert.ok(JSON.stringify(list.body).includes(TITLE));
  const one = await call('GET', `/albums/${album.id}`, { token: t.vendor });
  assert.equal(one.status, 200);
});

test('another vendor can neither open nor delete it', async () => {
  assert.equal((await call('GET', `/albums/${album.id}`, { token: other })).status, 404);
  assert.equal((await call('DELETE', `/albums/${album.id}`, { token: other })).status, 404);
  assert.ok(await prisma.albums.findUnique({ where: { id: album.id } }), 'still there');
});

test('renaming it is saved', async () => {
  const r = await call('PUT', `/albums/${album.id}`, { token: t.vendor, body: { title: `${TITLE} renamed` } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await prisma.albums.findUnique({ where: { id: album.id }, select: { title: true } })).title, `${TITLE} renamed`);
});

test('a photo uploads, with its smaller copies', async () => {
  const jpg = await sharp({ create: { width: 1600, height: 1067, channels: 3, background: { r: 120, g: 150, b: 140 } } }).jpeg({ quality: 80 }).toBuffer();
  const form = new FormData();
  form.append('photos', new Blob([jpg], { type: 'image/jpeg' }), 'iwopo-test.jpg');
  const r = await fetch(`${API}/albums/${album.id}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${t.vendor}` }, body: form });
  assert.ok([200, 201].includes(r.status), await r.text());
  const p = await prisma.photos.findFirst({ where: { album_id: album.id }, select: { id: true } });
  assert.ok(p, 'the photo is saved');
  photoId = p.id;
  for (const type of ['thumb', 'medium']) {             // the smaller copies clients see in the grid and full screen
    const f = await fetch(`${API}/albums/file/${photoId}/${type}`, { headers: { Authorization: `Bearer ${t.vendor}` } });
    assert.equal(f.status, 200, `${type}: ${f.status}`);
    assert.match(f.headers.get('content-type') || '', /^image\//, `${type} is an image`);
  }
});

test('the client opens the link and signs in with the gallery password', async () => {
  const g = await call('GET', `/g/${album.public_token}`);
  assert.equal(g.status, 200);
  assert.equal(g.body.album.photo_count, 1);
  assert.equal((await call('POST', `/g/${album.public_token}/auth`, { body: { password: 'wrong-password' } })).status, 401);
  const ok = await call('POST', `/g/${album.public_token}/auth`, { body: { password: GUEST } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('a made-up link finds nothing', async () => {
  assert.equal((await call('GET', '/g/0000000000000000000000000000dead')).status, 404);
});

test('deleting the photo removes it', async () => {
  const r = await call('DELETE', `/albums/${album.id}/photos/${photoId}`, { token: t.vendor });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await prisma.photos.count({ where: { album_id: album.id } }), 0);
});

test('deleting the album removes it and its folder', async () => {
  const r = await call('DELETE', `/albums/${album.id}`, { token: t.vendor });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await prisma.albums.findUnique({ where: { id: album.id } }), null);
  assert.equal(fs.existsSync(path.join(GALLERIES_ROOT, String(TEST_VENDOR), String(album.id))), false, 'its folder is gone');
});
