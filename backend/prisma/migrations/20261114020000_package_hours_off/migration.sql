-- 📦 A package's price is its price (Raj, 2026-11-13): the client's hours and guests reach the vendor before they
-- quote, so nothing is added by the hour on its own. Hours included / extra hour stay as plain facts on old packages.
ALTER TABLE "vendor_packages" ALTER COLUMN "auto_extra_hours" SET DEFAULT false;
ALTER TABLE "lead_packages" ALTER COLUMN "auto_extra_hours" SET DEFAULT false;
UPDATE "vendor_packages" SET "auto_extra_hours" = false WHERE "auto_extra_hours" = true;
UPDATE "lead_packages" SET "auto_extra_hours" = false WHERE "auto_extra_hours" = true;
