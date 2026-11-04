/**
 * 💬 What a browser is told when something breaks on our side (2026-11-04).
 *
 * 359 routes once answered a failure with the raw error text — a database error spells out table names, columns
 * and the query itself ("Invalid prisma.albums.findFirst() invocation …"), which helps an attacker and frightens
 * a couple. Now every one of them calls serverError(): the full error goes to the server log under a short
 * reference, and the browser gets a kind sentence quoting that reference — unless the message is one our own code
 * wrote for people (a plain Error with a short, single-line, non-technical message), which is shown as it is.
 */
import { randomBytes } from 'node:crypto';

const LOOKS_INTERNAL = /prisma|invocation|\bsql\b|column|relation|constraint|violates|duplicate key|ECONN|ETIMEDOUT|ENOTFOUND|EACCES|ENOENT|EPIPE|socket|\/var\/|\/root\/|node_modules|\bat \S+:\d|cannot read prop|is not a function|is not defined|unexpected token|undefined/i;

/** A message our own code wrote for a person — never a library's, never a crash. */
export function forPeople(e) {
  if (!(e instanceof Error) || e.constructor !== Error) return false;   // TypeError, Prisma, AWS … are never shown
  if (e.code || e.$metadata || e.clientVersion) return false;           // library errors carry codes
  const m = String(e.message || '');
  return m.length > 0 && m.length <= 200 && !m.includes('\n') && !LOOKS_INTERNAL.test(m);
}

/** Answer a failure: log it in full under a reference, tell the browser kindly. */
export function serverError(res, e) {
  const ref = randomBytes(3).toString('hex').toUpperCase();
  const req = res.req || {};
  console.error(`💥 ref ${ref} · ${req.method || ''} ${String(req.originalUrl || '').split('?')[0]} ·`, e?.stack || e);
  if (res.headersSent) return;
  res.status(500).json(forPeople(e)
    ? { error: e.message, ref }
    : { error: `Something went wrong on our side — please try again. If it keeps happening, quote ref ${ref}.`, ref });
}
