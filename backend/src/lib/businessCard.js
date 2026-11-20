/**
 * 🪪 The business on a client's document (Raj, 2026-11-20): who the vendor is — their logo, company name, phone and
 * business email — all from Settings → Account → Business profile (the vendors row). The contract's header and the
 * invoice both read it here, so every vendor's own details print on their own papers, and a detail added to the
 * profile later reaches every document from this one place.
 */

/** the vendors columns a document's business details come from */
export const CARD_FIELDS = { business_name: true, logo_path: true, phone: true, email: true };

/** { name, logo_path, phone, email } from a vendors row selected with CARD_FIELDS — an empty detail is null */
export function cardOf(v) {
  const clean = (s) => String(s ?? '').trim() || null;
  return { name: clean(v?.business_name), logo_path: clean(v?.logo_path), phone: clean(v?.phone), email: clean(v?.email) };
}
