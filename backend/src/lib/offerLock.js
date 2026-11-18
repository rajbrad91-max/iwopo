/**
 * 🔒 An offer that was unlocked locks again by itself (Raj, 2026-11-17). Sending packages locks them; a vendor may
 * unlock them to make a change, and they lock once more when the client signs the contract, and again whenever a
 * payment is recorded on a signed booking (a manual payment, a confirmed "I've paid", or a card payment online) — so an
 * agreed offer is never left open for an accidental change. Only a lead with packages and a signed contract.
 */
import prisma from '../config/prisma.js';

export async function relockOffer(leadId, vendorId) {
  await prisma.leads.updateMany({
    where: {
      id: Number(leadId), vendor_id: Number(vendorId),   // 🔒 the lead's own vendor
      packages_sent_at: null,
      lead_packages: { some: {} },
      contracts: { some: { status: 'signed', voided_at: null } },
    },
    data: { packages_sent_at: new Date(), updated_at: new Date() },
  });
}
