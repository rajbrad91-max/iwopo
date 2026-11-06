-- ➕ a removed add-on works until its paid period ends; 🧹 the old package tables retire — plans are the one source
ALTER TABLE "vendor_services" ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMPTZ(6);
DROP TABLE IF EXISTS "package_items";
DROP TABLE IF EXISTS "packages";
