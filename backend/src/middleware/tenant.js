// 🔒 TENANT ISOLATION
// Guarantees a vendor can ONLY touch their own data.
// Attaches req.tenantId — every vendor query MUST filter by it.

export function tenantScope(req, res, next) {
  const { role, vendor_id } = req.user;

  if (role === 'super_admin') {
    // Super admin can optionally act on a specific vendor via ?vendorId=
    req.tenantId = req.query.vendorId ? Number(req.query.vendorId) : null;
    req.isSuperAdmin = true;
  } else {
    // Vendors are LOCKED to their own vendor_id from the token.
    // They can never override it (not from body, not from query).
    req.tenantId = vendor_id;
    req.isSuperAdmin = false;
  }
  next();
}
