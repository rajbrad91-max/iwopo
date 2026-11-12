/**
 * 📝 "Join the waitlist" on the public page while sign-ups are paused (Raj, 2026-11-12): an email is kept once, something
 * that is not an email is refused, and the hidden box only a bot fills keeps nothing. Everything it adds is removed.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging, API } from './helpers.js';

staging();
const EMAIL = 'iwopo-tests-waitlist@example.test', BOT = 'iwopo-tests-waitlist-bot@example.test';
const join = (body) => fetch(`${API}/auth/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const clean = () => prisma.waitlist.deleteMany({ where: { email: { in: [EMAIL, BOT] } } });
await clean();
after(async () => { await clean(); await prisma.$disconnect(); });

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
