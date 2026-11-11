/**
 * 🔒 Tenancy (code audit #4, 2026-11-11): a vendor only ever sees their own data, whatever vendor id they send; a super
 * admin sees the vendor they name. The full cross-vendor probe also runs in sync>iwopo (tenancy_probe.mjs).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging, tokens, call } from './helpers.js';

staging();
const { actingVendorId, ownVendorId } = await import('../src/lib/vendorScope.js');
after(() => prisma.$disconnect());
const t = await tokens();
const OTHER = 1;   // Perfect Poses on staging — a vendor with data of its own, not the test vendor

test('the tenancy helper: vendor from the token, super admin from what they name', () => {
  const vendor = { user: { role: 'vendor', vendor_id: 7 }, query: { vendor_id: '9' }, body: { vendor_id: 9 } };
  assert.equal(actingVendorId(vendor), 7);
  assert.equal(ownVendorId(vendor), 7);
  const admin = { user: { role: 'super_admin', vendor_id: null }, query: {}, body: { vendor_id: 9 } };
  assert.equal(actingVendorId(admin), 9);
  assert.equal(actingVendorId(admin, { body: false }), null, 'query only');
  assert.equal(actingVendorId({ ...admin, query: { vendor_id: '4' } }), '4');
});

for (const path of ['/bookings', '/contracts', '/notifications']) {
  test(`${path}: a vendor asking for another vendor gets only their own`, async () => {
    const own = await call('GET', path, { token: t.vendor });
    const asked = await call('GET', `${path}?vendor_id=${OTHER}`, { token: t.vendor });
    assert.equal(asked.status, 200);
    assert.deepEqual(asked.body, own.body);
  });
}

test('a super admin sees the vendor they name', async () => {
  const r = await call('GET', `/bookings?vendor_id=${OTHER}`, { token: t.admin });
  assert.equal(r.status, 200);
  const list = Array.isArray(r.body) ? r.body : r.body.bookings || [];
  assert.ok(list.length > 0, 'that vendor’s bookings are returned');
  assert.ok(list.every(b => b.vendor_id === undefined || b.vendor_id === OTHER), 'and only theirs');
});
