/**
 * ✏️ "Edit this contract": one client's own version of the agreement (Raj, 2026-11-12). It changes that client's
 * contract only — never the vendor's template or another client's — follows them through a rebuild, goes back to the
 * template when the vendor chooses, keeps another vendor out, and stops once the agreement is signed. Runs on the test
 * vendor; everything it makes is removed.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging, tokens, call, emailOff, TEST_VENDOR } from './helpers.js';

staging();
const { signToken } = await import('../src/middleware/auth.js');
const t = await tokens();
const otherUser = await prisma.users.findFirst({ where: { vendor_id: 1 }, orderBy: { id: 'asc' }, select: { id: true, role: true, vendor_id: true, email: true, name: true } });
const other = signToken(otherUser);
const EMAILS = ['iwopo-tests-ctedit-a@example.test', 'iwopo-tests-ctedit-b@example.test'];
const NAME = 'iwopo-tests contract';
const SOCIAL = 'We may share a few favourite images on social media.';
let tpl, leadA, leadB, own, contractA;
let emailBack = null;

const cleanup = async () => {
  const ids = (await prisma.leads.findMany({ where: { email: { in: EMAILS } }, select: { id: true } })).map(l => l.id);
  if (ids.length) {
    const cts = (await prisma.contracts.findMany({ where: { lead_id: { in: ids } }, select: { id: true } })).map(c => c.id);
    if (cts.length) await prisma.contract_audit.deleteMany({ where: { contract_id: { in: cts } } });
    await prisma.contracts.deleteMany({ where: { lead_id: { in: ids } } });
    await prisma.contract_templates.deleteMany({ where: { lead_id: { in: ids } } });
    await prisma.notifications.deleteMany({ where: { vendor_id: TEST_VENDOR, link_id: { in: ids } } });
    await prisma.leads.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.contract_templates.deleteMany({ where: { vendor_id: TEST_VENDOR, name: NAME } });
};
before(async () => { await cleanup(); emailBack = await emailOff(); });
after(async () => { if (emailBack) await emailBack(); await cleanup(); await prisma.$disconnect(); });

const preview = async (lead) => (await call('GET', `/contracts/preview/${lead.id}`, { token: t.vendor })).body?.contract;

test('a template and two clients', async () => {
  const r = await call('POST', '/contracts/templates', { token: t.vendor, body: { name: NAME, sections: [
    { id: 's1', title: 'Coverage', text: 'We cover the {{event_type}}.' },
    { id: 's2', title: 'Social media', text: SOCIAL },
  ] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tpl = r.body.template;
  const mk = (email) => prisma.leads.create({ data: { vendor_id: TEST_VENDOR, name: 'Contract Edit Test', email, event_type: 'Wedding', status: 'New' } });
  [leadA, leadB] = [await mk(EMAILS[0]), await mk(EMAILS[1])];
  const c = await call('POST', `/contracts/lead/${leadA.id}`, { token: t.vendor, body: { template_id: tpl.id } });
  assert.equal(c.status, 201);
  contractA = c.body.contract;
  assert.ok(contractA.body.includes(SOCIAL));
});

test('another vendor cannot make or change a client’s version', async () => {
  assert.equal((await call('POST', `/contracts/lead/${leadA.id}/own-version`, { token: other })).status, 403);
});

test('the client’s own version is made once, copied from their template, and is not a template', async () => {
  const r = await call('POST', `/contracts/lead/${leadA.id}/own-version`, { token: t.vendor });
  assert.equal(r.status, 201);
  own = r.body.template;
  assert.equal(own.lead_id, leadA.id);
  assert.equal(own.copied_from_id, tpl.id);
  const again = await call('POST', `/contracts/lead/${leadA.id}/own-version`, { token: t.vendor });
  assert.equal(again.status, 200);
  assert.equal(again.body.template.id, own.id);
  const list = (await call('GET', '/contracts/templates', { token: t.vendor })).body.templates;
  assert.ok(list.some(x => x.id === tpl.id) && !list.some(x => x.id === own.id), 'Contract setup lists templates, not clients’ versions');
  assert.equal((await call('PUT', `/contracts/templates/${own.id}/default`, { token: t.vendor })).status, 400);
});

test('editing it changes this client only — not the template, not another client', async () => {
  assert.equal((await call('PUT', `/contracts/templates/${own.id}`, { token: other, body: { name: 'x' } })).status, 403);
  const r = await call('PUT', `/contracts/templates/${own.id}`, { token: t.vendor, body: { ...own, sections: own.sections.filter(x => x.id !== 's2') } });
  assert.equal(r.status, 200);
  const a = await preview(leadA), b = await preview(leadB);
  assert.ok(!a.body.includes(SOCIAL) && a.own_version === true, 'this client’s preview has the edit');
  assert.ok(b.body.includes(SOCIAL) && b.own_version === false, 'another client keeps the template');
  const fresh = await prisma.contract_templates.findUnique({ where: { id: tpl.id } });
  assert.equal(fresh.sections.length, 2, 'the template is unchanged');
  const built = await prisma.contracts.findUnique({ where: { id: contractA.id }, select: { body: true, template_id: true } });
  assert.ok(!built.body.includes(SOCIAL), 'the built contract follows the edit');
  assert.equal(built.template_id, tpl.id, 'it still records the template it came from');
});

test('“Use my template again” brings the template back for this client', async () => {
  assert.equal((await call('DELETE', `/contracts/templates/${own.id}`, { token: t.vendor })).status, 200);
  const a = await preview(leadA);
  assert.ok(a.body.includes(SOCIAL) && a.own_version === false);
  const built = await prisma.contracts.findUnique({ where: { id: contractA.id }, select: { body: true } });
  assert.ok(built.body.includes(SOCIAL));
});

test('a signed agreement can no longer change', async () => {
  await prisma.contracts.update({ where: { id: contractA.id }, data: { status: 'signed' } });
  assert.equal((await call('POST', `/contracts/lead/${leadA.id}/own-version`, { token: t.vendor })).status, 409);
});
