/**
 * 🧱 The second lock on a vendor's data (2026-11-04).
 *
 * Vendor routes check ownership first ("is this contract yours?") and then write by id. That is safe while the
 * check is there; a future edit that drops it would let the write reach another vendor's row. So the write names
 * the vendor too: Prisma accepts extra conditions beside the id in update/delete (and in updateMany/deleteMany),
 * and a row that isn't this vendor's simply isn't found.
 *
 * mine(v) — the condition for a table with its own vendor_id.
 * mineVia(rel, v) — the same through the parent a child row belongs to (lead_crew → leads).
 * A super admin acting without naming a vendor (v empty) gets no extra condition, exactly as before.
 */
export const mine = (v) => (v ? { vendor_id: Number(v) } : {});
export const mineVia = (rel, v) => (v ? { [rel]: { vendor_id: Number(v) } } : {});
