/**
 * ⏳ Free-trial reminders (2026-10-31): 7 days before the trial ends, 1 day before, and the day it ends.
 *
 * Checked every few hours by the API process. vendors.trial_reminders remembers how many have gone out (0–3), so
 * each one is sent once even across restarts. Owners (billing_exempt) and paying vendors are never reminded.
 */
import prisma from '../config/prisma.js';
import { trialEnd, paidSubscription } from './billing.js';
import { notify } from '../routes/notifications.js';
import { sendPlatformEmail } from '../routes/email.js';

const DAY = 86_400_000;
const APP_URL = (process.env.APP_URL || 'https://iwopo.com').replace(/\/+$/, '');
const STAGES = [
  { n: 1, when: (left) => left <= 7 * DAY, title: '⏳ 7 days left in your iwopo trial', line: 'Your free trial ends in 7 days. Choose a plan any time — billing only starts when the trial ends.' },
  { n: 2, when: (left) => left <= DAY, title: '⏳ Your iwopo trial ends tomorrow', line: 'Your free trial ends tomorrow. Choose a plan to keep everything running without a break.' },
  { n: 3, when: (left) => left <= 0, title: '💳 Your iwopo trial has ended', line: 'Your free trial has ended and your features are paused. Your clients, galleries and files are safe — choose a plan to switch everything back on.' },
];

async function remind() {
  const vendors = await prisma.vendors.findMany({
    where: { billing_exempt: false, status: 'trial', trial_reminders: { lt: 3 } },
    select: { id: true, business_name: true, trial_ends_at: true, created_at: true, trial_reminders: true },
  });
  for (const v of vendors) {
    if (await paidSubscription(v.id)) continue;
    const left = trialEnd(v).getTime() - Date.now();
    const due = STAGES.filter(s => s.n > (v.trial_reminders || 0) && s.when(left)).pop();     // only the latest one due
    if (!due) continue;
    await prisma.vendors.update({ where: { id: v.id }, data: { trial_reminders: due.n } });   // mark first: never twice
    notify(v.id, due.title, due.line, 'plans', { type: 'plans' });
    const owner = await prisma.users.findFirst({ where: { vendor_id: v.id, role: 'vendor' }, orderBy: { id: 'asc' }, select: { email: true, name: true } });
    if (owner?.email) {
      await sendPlatformEmail(owner.email, due.title.replace(/^\S+\s/, ''),
        `Hi ${owner.name || v.business_name},\n\n${due.line}\n\nChoose a plan: ${APP_URL}/panel/plans\n\n— iwopo`,
        `<p>Hi ${owner.name || v.business_name},</p><p>${due.line}</p><p><a href="${APP_URL}/panel/plans">Choose a plan</a></p><p>— iwopo</p>`,
      ).catch(e => console.error('[trial reminder]', v.id, e.message));
    }
  }
}

/** Start the checks: shortly after boot, then every 6 hours. */
export function startTrialReminders() {
  const run = () => remind().catch(e => console.error('[trial reminders]', e.message));
  setTimeout(run, 60_000);
  setInterval(run, 6 * 60 * 60 * 1000);
}
