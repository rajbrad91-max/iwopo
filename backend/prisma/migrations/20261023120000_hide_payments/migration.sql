-- 🔒 Payment privacy (Raj, 2026-10-23): a vendor can keep payment amounts hidden until they tap 👁
ALTER TABLE "vendor_settings" ADD COLUMN IF NOT EXISTS "hide_payments" BOOLEAN NOT NULL DEFAULT false;
