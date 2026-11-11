/**
 * 📨 The public inquiry form — how every lead arrives (clients.perfectposes.ca/inquiry and every vendor's own address).
 * Test leads use an @example.test address and are removed afterwards; no real email is sent (noRealEmail).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { prisma, staging, call, noRealEmail, TEST_VENDOR } from './helpers.js';

staging();
const EMAIL = 'iwopo-tests-inquiry@example.test';
const cleanup = async () => {
  const ids = (await prisma.leads.findMany({ where: { email: EMAIL }, select: { id: true } })).map(l => l.id);
  if (ids.length) {
    await prisma.notifications.deleteMany({ where: { vendor_id: TEST_VENDOR, link_id: { in: ids } } });
    await prisma.leads.deleteMany({ where: { id: { in: ids } } });
  }
};
after(async () => { await cleanup(); await prisma.$disconnect(); });
const { slug } = await prisma.vendors.findUnique({ where: { id: TEST_VENDOR }, select: { slug: true } });
const lead = { vendor_slug: slug, name: 'Inquiry Test', email: EMAIL, phone: '6045550100', event_type: 'Wedding', event_date: '2027-08-08', location: 'Surrey' };

test('an inquiry through the public form is saved for that vendor', async () => {
  await noRealEmail(async () => {
    const r = await call('POST', '/leads', { body: lead });
    assert.equal(r.status, 201);
    const saved = await prisma.leads.findFirst({ where: { email: EMAIL }, select: { vendor_id: true, name: true, status: true } });
    assert.equal(saved?.vendor_id, TEST_VENDOR);
    assert.equal(saved.name, 'Inquiry Test');
    await wait(6000);   // the new-lead alert is sent after the answer — let it try (and fail) before the settings go back
  });
});

test('the form never takes a vendor id, only its public name', async () => {
  const r = await call('POST', '/leads', { body: { ...lead, vendor_slug: undefined, vendor_id: TEST_VENDOR } });
  assert.equal(r.status, 400);
});

test('an unknown vendor name is refused', async () => {
  const r = await call('POST', '/leads', { body: { ...lead, vendor_slug: 'no-such-vendor-iwopo-tests' } });
  assert.equal(r.status, 404);
});

test('a phone number with letters is refused, and the box is named', async () => {
  const r = await call('POST', '/leads', { body: { ...lead, phone: 'call me maybe' } });
  assert.equal(r.status, 400);
  assert.equal(r.body?.field, 'phone');
});
