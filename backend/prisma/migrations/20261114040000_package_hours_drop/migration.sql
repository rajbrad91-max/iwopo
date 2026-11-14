-- 📦 Hours never price a package (Raj, 2026-11-13): the client's hours reach the vendor before they quote, and
-- whatever a package provides is a line in it. The columns that carried the hour arithmetic go.
-- vendor_packages.included_hours / per_hour_price stay: the assistant reads them and older bookings were priced by them;
-- lead_packages.per_hour_price stays: it prices pre-events added as extras.
ALTER TABLE "lead_packages" DROP COLUMN IF EXISTS "included_hours";
ALTER TABLE "lead_packages" DROP COLUMN IF EXISTS "auto_extra_hours";
ALTER TABLE "vendor_packages" DROP COLUMN IF EXISTS "auto_extra_hours";
