import prisma from '../config/prisma.js';
import { leadQuestions } from './formRules.js';

/** 🧾 A lead's questions (lib/formRules.js leadQuestions) with its vendor's current form read from the database. */
export async function questionsForLead(lead, vendorId = lead.vendor_id) {
  const s = await prisma.inquiry_settings.findUnique({ where: { vendor_id: Number(vendorId) }, select: { custom_fields: true } });   // 🔒 the lead's own vendor
  return leadQuestions(lead.form_snapshot, s?.custom_fields, lead.custom_data);
}

/** The current form of each vendor in `vendorIds`, as a Map — one query for a whole list of leads. */
export async function formsByVendor(vendorIds) {
  const ids = [...new Set(vendorIds.filter(Boolean).map(Number))];
  if (!ids.length) return new Map();
  const rows = await prisma.inquiry_settings.findMany({ where: { vendor_id: { in: ids } }, select: { vendor_id: true, custom_fields: true } });
  return new Map(rows.map(r => [r.vendor_id, r.custom_fields]));
}
