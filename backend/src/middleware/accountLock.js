/**
 * 🔒 What a vendor whose access has ended may still do in the panel (lib/accountLapse.js — Raj, 2026-11-15).
 *   read-only  → look and download (GET), plus their account, plans, payment, notices and help
 *   suspended  → only their account, plans, payment, notices and help — the panel shows Plans and nothing else
 * Super admin, and requests with no vendor behind them, pass. The public doors are closed per door (clientLinks.js).
 */
import { tryUser } from '../lib/entitlements.js';
import { tokenStillValid } from '../lib/tokenRevocation.js';
import { accountStage } from '../lib/accountLapse.js';
import { serverError } from '../lib/httpError.js';

const ALWAYS = new Set(['auth', 'billing', 'support', 'notifications', 'help', 'me']);
const reading = (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';

export const READ_ONLY = { error: 'account_readonly', message: 'Your account is read-only — choose a plan to add or change anything.' };
export const SUSPENDED = { error: 'account_suspended', message: 'Your account is suspended — choose a plan to open it again.' };

export async function accountLock(req, res, next) {
  const user = tryUser(req);
  if (!user?.vendor_id || user.role === 'super_admin' || !await tokenStillValid(user)) return next();
  if (ALWAYS.has(req.path.split('/')[1])) return next();
  try {
    const { stage } = await accountStage(user.vendor_id);
    if (stage === 'open') return next();
    if (stage === 'readonly') return reading(req) ? next() : res.status(402).json(READ_ONLY);
    return res.status(402).json(SUSPENDED);
  } catch (e) { return serverError(res, e); }
}
