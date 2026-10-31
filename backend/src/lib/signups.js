/**
 * 🚧 Whether new studios can sign up (Raj, 2026-10-31: paused until iwopo is ready to launch).
 *
 * One switch, no deploy needed: platform_settings key 'signups_open'. 'false' = closed; anything else (or no row) =
 * open. Read fresh each time (a handful of sign-up attempts, never a hot path). Log in is never affected.
 */
import prisma from '../config/prisma.js';

export async function signupsOpen() {
  const row = await prisma.platform_settings.findUnique({ where: { key: 'signups_open' }, select: { value: true } }).catch(() => null);
  return String(row?.value ?? 'true').toLowerCase() !== 'false';
}

export const SIGNUPS_CLOSED_MESSAGE = 'iwopo is opening very soon — new sign-ups are paused while we finish up. Already have an account? Log in as usual.';
