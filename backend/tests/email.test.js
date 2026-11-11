/**
 * 📧 Setup Email (2026-11-11): "My own SMTP" is never saved without what it needs — saved without a server it used to
 * fall back to iwopo's no-reply address silently. The test vendor's own settings are put back afterwards.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, staging, tokens, call, TEST_VENDOR } from './helpers.js';

staging();
const before = await prisma.email_settings.findFirst({ where: { vendor_id: TEST_VENDOR } });
after(async () => {
  if (before) {
    const keep = Object.fromEntries(Object.entries(before).filter(([k]) => k !== 'id' && k !== 'vendor_id'));
    await prisma.email_settings.update({ where: { vendor_id: TEST_VENDOR }, data: keep });
  } else await prisma.email_settings.deleteMany({ where: { vendor_id: TEST_VENDOR } });
  await prisma.$disconnect();
});
const t = await tokens();
const save = (body) => call('PUT', '/email/settings', { token: t.vendor, body });
const full = { mode: 'smtp', smtp_host: 'smtp.example.test', smtp_port: 587, smtp_user: 'studio@example.test', smtp_pass: 'x', from_email: 'studio@example.test' };

for (const [field, label] of [['smtp_host', 'Sending server (SMTP)'], ['smtp_user', 'Login email']]) {
  test(`My own SMTP without its ${label} is refused, and the box is named`, async () => {
    const r = await save({ ...full, [field]: '' });
    assert.equal(r.status, 400);
    assert.equal(r.body.field, field);
  });
}

test('My own SMTP without any password is refused', async () => {
  await prisma.email_settings.deleteMany({ where: { vendor_id: TEST_VENDOR } });
  const r = await save({ ...full, smtp_pass: '' });
  assert.equal(r.status, 400);
  assert.equal(r.body.field, 'smtp_pass');
});

test('complete settings are saved, and a saved password is kept when the box shows the stand-in', async () => {
  assert.equal((await save(full)).status, 200);
  assert.equal((await save({ ...full, smtp_pass: '••••••' })).status, 200);
  const row = await prisma.email_settings.findFirst({ where: { vendor_id: TEST_VENDOR }, select: { smtp_pass: true } });
  assert.ok(row.smtp_pass && row.smtp_pass !== '••••••', 'the real password stays');
});

test('the saved password is never sent back to the page', async () => {
  const r = await call('GET', '/email/settings', { token: t.vendor });
  assert.equal(r.status, 200);
  assert.equal(r.body.settings.smtp_pass, '••••••');
});

test('Platform email needs none of the boxes', async () => {
  assert.equal((await save({ mode: 'platform' })).status, 200);
});
