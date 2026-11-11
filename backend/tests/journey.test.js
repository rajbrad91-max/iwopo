/**
 * 📄 A client's whole journey after the inquiry: contract (built, released, signed), payment, invoice, booking —
 * and the tenancy wall on each. One test lead goes through it all and is removed afterwards with everything it made;
 * no real email is sent (noRealEmail).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging, tokens, call, emailOff, TEST_VENDOR } from './helpers.js';

staging();
const { signToken } = await import('../src/middleware/auth.js');
const t = await tokens();
const otherUser = await prisma.users.findFirst({ where: { vendor_id: 1 }, orderBy: { id: 'asc' }, select: { id: true, role: true, vendor_id: true, email: true, name: true } });
const other = signToken(otherUser);
const EMAIL = 'iwopo-tests-journey@example.test';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
let lead, contract, invoice;
let emailBack = null;

const cleanup = async () => {
  const ids = (await prisma.leads.findMany({ where: { email: EMAIL }, select: { id: true } })).map(l => l.id);
  if (!ids.length) return;
  const where = { lead_id: { in: ids } };
  for (const model of ['payments', 'invoices']) await prisma[model].deleteMany({ where });
  const cts = (await prisma.contracts.findMany({ where, select: { id: true } })).map(c => c.id);
  for (const [model, key] of [['contract_audit', 'contract_id'], ['contract_events', 'contract_id']]) {
    if (prisma[model] && cts.length) await prisma[model].deleteMany({ where: { [key]: { in: cts } } });
  }
  await prisma.contracts.deleteMany({ where });
  await prisma.notifications.deleteMany({ where: { vendor_id: TEST_VENDOR, link_id: { in: ids } } });
  await prisma.leads.deleteMany({ where: { id: { in: ids } } });
};

// the whole file runs with the test vendor's email pointed nowhere; their settings come back afterwards
before(async () => { await cleanup(); emailBack = await emailOff(); });
after(async () => { if (emailBack) await emailBack(); await cleanup(); await prisma.$disconnect(); });

test('the vendor adds a lead by hand', async () => {
  const r = await call('POST', '/leads', { token: t.vendor, body: { name: 'Journey Test', email: EMAIL, phone: '6045550101', event_type: 'Wedding', event_date: '2027-09-18', location: 'Abbotsford' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  lead = await prisma.leads.findFirst({ where: { email: EMAIL }, select: { id: true, vendor_id: true } });
  assert.equal(lead.vendor_id, TEST_VENDOR);
});

test('a contract is built for the lead, with its details filled in', async () => {
  const r = await call('POST', `/contracts/lead/${lead.id}`, { token: t.vendor, body: { title: 'Test Agreement', body: 'Agreement with {{client_name}} for their {{event_type}}.' } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  contract = await prisma.contracts.findFirst({ where: { lead_id: lead.id }, orderBy: { id: 'desc' } });
  assert.ok(contract?.token, 'it has a signing link');
  assert.match(contract.body, /Agreement with Journey Test for their Wedding/, 'the client’s name and event are filled in');
});

test('another vendor can neither read nor add contracts on this lead', async () => {
  assert.ok([403, 404].includes((await call('GET', `/contracts/lead/${lead.id}`, { token: other })).status));
  assert.equal((await call('POST', `/contracts/lead/${lead.id}`, { token: other, body: { body: 'x' } })).status, 403);
});

test('a contract the vendor has not released cannot be signed', async (tt) => {
  if (contract.released_at) return tt.skip('this vendor releases contracts automatically');
  const r = await call('POST', `/contracts/sign/${contract.token}`, { body: { signed_name: 'Journey Test', signature_data: PNG } });
  assert.equal(r.status, 409);
});

test('released, the client opens it and signs; it cannot be signed twice', async () => {
  if (!contract.released_at) assert.equal((await call('PUT', `/contracts/${contract.id}/release`, { token: t.vendor })).status, 200);
  assert.equal((await call('GET', `/contracts/sign/${contract.token}`)).status, 200);
  const s = await call('POST', `/contracts/sign/${contract.token}`, { body: { signed_name: 'Journey Test', signature_data: PNG, initials: 'JT' } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal((await prisma.contracts.findUnique({ where: { id: contract.id }, select: { status: true } })).status, 'signed');
  assert.equal((await call('POST', `/contracts/sign/${contract.token}`, { body: { signed_name: 'Journey Test', signature_data: PNG } })).status, 400);
});

test('the signed contract’s certificate opens', async () => {
  assert.equal((await call('GET', `/contracts/certificate/${contract.token}`)).status, 200);
});

test('a payment is recorded and the lead becomes a booking', async () => {
  const r = await call('POST', `/payments/lead/${lead.id}`, { token: t.vendor, body: { amount: 500, method: 'e-transfer', note: 'deposit' } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  assert.equal(await prisma.payments.count({ where: { lead_id: lead.id } }), 1);
  const b = await call('GET', '/bookings', { token: t.vendor });
  assert.ok(JSON.stringify(b.body).includes('Journey Test'), 'in Bookings');
});

test('another vendor cannot record a payment or open the booking', async () => {
  assert.ok([403, 404].includes((await call('POST', `/payments/lead/${lead.id}`, { token: other, body: { amount: 1 } })).status));
  assert.ok([403, 404].includes((await call('GET', `/bookings/${lead.id}`, { token: other })).status));
  assert.equal(await prisma.payments.count({ where: { lead_id: lead.id } }), 1, 'still one payment');
});

test('an invoice is made, and the client’s link shows it with the payment taken off', async () => {
  const r = await call('POST', `/invoices/lead/${lead.id}`, { token: t.vendor, body: { items: [{ label: 'Wedding photography', amount: 2000 }] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  invoice = r.body.invoice;
  const v = await call('GET', `/invoices/view/${invoice.token}`);
  assert.equal(v.status, 200);
  assert.equal(Number(v.body.invoice.total), 2000);
  assert.equal(Number(v.body.invoice.paid), 500);
  assert.equal(Number(v.body.invoice.balance), 1500);
});

test('another vendor cannot make an invoice on this lead', async () => {
  assert.equal((await call('POST', `/invoices/lead/${lead.id}`, { token: other, body: {} })).status, 403);
});
