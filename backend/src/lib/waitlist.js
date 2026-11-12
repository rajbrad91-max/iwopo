/**
 * 📝 The waitlist, while sign-ups are paused (Raj, 2026-11-12). An address is kept once. When a new one joins, the
 * owner's inbox is told — unless the Super Admin switch "Email me when someone joins" is off — and Super Admin lists
 * everyone (routes/index.js).
 */
import prisma from '../config/prisma.js';
import { getSetting } from './settings.js';
import { OWNER_INBOX } from './ownerInbox.js';
import { noteFailure } from './noteFailure.js';
import { sendPlatformEmail } from '../routes/email.js';

export const WAITLIST_ALERTS = 'waitlist_alerts';
export async function waitlistAlertsOn() {
  return String(await getSetting(WAITLIST_ALERTS, 'true')).toLowerCase() !== 'false';
}

/** Adds an address to the waitlist once. True when it is new. */
export async function joinWaitlist(email) {
  const added = await prisma.waitlist.createMany({ data: [{ email }], skipDuplicates: true });
  if (!added.count) return false;
  if (await waitlistAlertsOn()) {
    const total = await prisma.waitlist.count();
    sendPlatformEmail(OWNER_INBOX, `New on the iwopo waitlist: ${email}`,
      `${email} asked to be told when iwopo opens.\n\nPeople on the waitlist now: ${total}\nSee everyone in Super Admin → Waitlist.`, null, { replyTo: email })
      .catch(e => noteFailure('email the owner about a waitlist sign-up', e));
  }
  return true;
}
