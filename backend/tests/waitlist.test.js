/**
 * 📝 "Join the waitlist" on the public page while sign-ups are paused (Raj, 2026-11-12): an email is kept once, something
 * that is not an email is refused, and the hidden box only a bot fills keeps nothing. Everything it adds is removed.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging, tokens, call, API } from './helpers.js';

staging();
const EMAIL = 'iwopo-tests-waitlist@example.test', BOT = 'iwopo-tests-waitlist-bot@example.test';
const join = (body) => fetch(`${API}/auth/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const clean = () => prisma.waitlist.deleteMany({ where: { email: { in: [EMAIL, BOT] } } });
await clean();
// no real email from a test: the owner's alert is switched off for the run, then put back as it was
const ALERTS = 'waitlist_alerts';
const alertsBefore = await prisma.platform_settings.findUnique({ where: { key: ALERTS } });
await prisma.platform_settings.upsert({ where: { key: ALERTS }, update: { value: 'false' }, create: { key: ALERTS, value: 'false' } });
after(async () => {
  await clean();
  if (alertsBefore) await prisma.platform_settings.update({ where: { key: ALERTS }, data: { value: alertsBefore.value } });
  else await prisma.platform_settings.deleteMany({ where: { key: ALERTS } });
  await prisma.$disconnect();
});

test('an email joins the waitlist, and only once', async () => {
  assert.equal((await join({ email: `  ${EMAIL.toUpperCase()} ` })).status, 200);
  assert.equal((await join({ email: EMAIL })).status, 200, 'asking again is not an error');
  assert.equal(await prisma.waitlist.count({ where: { email: EMAIL } }), 1);
});

test('something that is not an email is refused', async () => {
  assert.equal((await join({ email: 'not-an-email' })).status, 400);
});

test('the hidden box only a bot fills keeps nothing', async () => {
  assert.equal((await join({ email: BOT, website: 'http://spam.example' })).status, 200);
  assert.equal(await prisma.waitlist.count({ where: { email: BOT } }), 0);
});

test('Super Admin sees the list; a vendor does not', async () => {
  const t = await tokens();
  const list = await call('GET', '/admin/waitlist', { token: t.admin });
  assert.equal(list.status, 200);
  assert.ok(list.body.people.some(p => p.email === EMAIL) && list.body.total >= 1 && list.body.alerts === false);
  assert.equal((await call('GET', '/admin/waitlist', { token: t.vendor })).status, 403);
  assert.equal((await call('DELETE', `/admin/waitlist/${list.body.people.find(p => p.email === EMAIL).id}`, { token: t.vendor })).status, 403);
});
