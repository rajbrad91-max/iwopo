/**
 * 🚦 A limit on how often the same caller may try something.
 *
 * Hand-rolled and in memory, matching what chatbot.js already does, because
 * both API processes run single-instance under pm2 — a counter in this process
 * IS the counter. If the API is ever run in cluster mode this has to move to
 * the database or Redis, or each worker will let the full allowance through.
 *
 * The point is the password doors. Guessing a login, an album password or a
 * share-link password was unlimited: eight wrong attempts in a row returned
 * eight plain 401s and nothing slowed down.
 */

const buckets = new Map();
/** when each bucket last refused — so onBlock fires once per lock, not on every refused try */
const blockedAt = new Map();

// a caller who stops trying should stop costing memory
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    const live = hits.filter(t => t > now - 3600_000);
    if (live.length) buckets.set(key, live); else buckets.delete(key);
  }
}, 600_000).unref();

/** The address the request really came from, since nginx is in front. */
export function callerIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {object} opts
 * @param {number} opts.max     attempts allowed inside the window
 * @param {number} opts.windowMs
 * @param {string} opts.name    keeps one door's budget separate from another's
 * @param {(req)=>string} [opts.key] extra key — an email, say, so one address
 *        cannot burn through every account's allowance at once
 */
/* perAccount: count by the key alone (an email, say) across every device and network — otherwise someone spreading
   tries over many addresses gets the whole allowance on each. onBlock(req): called once when the lock closes. */
export function limit({ max, windowMs, name, key, perAccount = false, onBlock }) {
  return (req, res, next) => {
    const id = perAccount && key ? `${name}::${key(req)}` : `${name}:${callerIp(req)}:${key ? key(req) : ''}`;
    const now = Date.now();
    const hits = (buckets.get(id) || []).filter(t => t > now - windowMs);

    if (hits.length >= max) {
      const retry = Math.ceil((hits[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retry));
      if (onBlock && !((blockedAt.get(id) || 0) > now - windowMs)) { blockedAt.set(id, now); Promise.resolve(onBlock(req)).catch(() => {}); }
      // deliberately vague: naming the limit tells someone probing exactly how
      // long to wait between attempts
      return res.status(429).json({ error: 'Too many attempts. Please try again shortly.' });
    }

    hits.push(now);
    buckets.set(id, hits);
    next();
  };
}

/** A successful attempt should not count against the caller. */
export function forgive(name, req, key = '') {
  buckets.delete(`${name}:${callerIp(req)}:${key}`);
  buckets.delete(`${name}::${key}`);   // the per-account count (perAccount: true)
}
