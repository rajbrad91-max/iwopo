import prisma from '../config/prisma.js';

/** 👣 Someone used the panel — stamped at most once an hour per person. The Free clean-up counts from it (lib/inactiveFree.js). */
const seen = new Map();
export function touchSeen(userId) {
  const id = Number(userId);
  if (!id || (seen.get(id) || 0) > Date.now() - 60 * 60_000) return;
  seen.set(id, Date.now());
  prisma.users.update({ where: { id }, data: { last_seen_at: new Date() } }).catch(() => {});
}
