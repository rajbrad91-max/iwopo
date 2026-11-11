/**
 * 🔒 Which vendor a request acts for — the tenancy wall, written once (code audit #4, Raj 2026-11-11). Twelve route
 * files used to carry their own copy of this; they import it from here, so a change to the rule is made in one place.
 * The vendor id always comes from the signed-in user's token, never from the request — except that a super admin,
 * who has no vendor of their own, names the vendor they are looking at.
 */

/**
 * A vendor acts for themselves; a super admin for the vendor they name — `?vendor_id=`, or `vendor_id` in the body
 * unless `body: false` — or null when they name none.
 */
export function actingVendorId(req, { body = true } = {}) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || (body ? req.body?.vendor_id : null) || null;
  return req.user.vendor_id;
}

/** The signed-in vendor's own id — for routes no super admin acts through (albums, the chatbot panel). */
export function ownVendorId(req) {
  return req.user.vendor_id;
}
