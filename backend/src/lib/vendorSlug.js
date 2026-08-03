/**
 * 🔗 A vendor's public handle.
 *
 * The inquiry form used to live at /inquiry/1 — the row's primary key. That
 * told anyone who looked how many vendors exist and let them walk the list by
 * counting upwards. It also read like a database, not like a business.
 *
 * A vendor now has a slug, derived once from their business name and never
 * changed afterwards: a link that has been printed on a card or sent to a
 * couple has to keep working even if the studio is renamed later.
 */

/** Lower-case, alphanumerics and dashes, nothing else, 60 characters at most. */
export function slugify(input) {
  return String(input || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // é → e, ü → u
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');                                  // in case the cut left one
}

/**
 * A slug nothing else is using. Pass the transaction client during signup so
 * the check and the insert are in the same transaction — two studios with the
 * same name registering at once would otherwise both pass the check.
 */
export async function uniqueVendorSlug(db, businessName) {
  let base = slugify(businessName);
  // digits only would be indistinguishable from the numeric links we retired,
  // and an empty result happens whenever a name has no latin characters at all
  if (!base || /^\d+$/.test(base)) base = 'studio';

  let slug = base;
  for (let n = 2; ; n++) {
    const clash = await db.vendors.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
    slug = `${base}-${n}`;
    if (n > 200) return `${base}-${Date.now().toString(36)}`;   // give up gracefully
  }
}
