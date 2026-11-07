-- 👋 the getting-started steps, shown once after a first payment; 🌗 a new vendor's panel follows their device (Raj, 2026-11-07)
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "welcome_seen_at" TIMESTAMP(6);
ALTER TABLE "vendor_settings" ALTER COLUMN "theme" SET DEFAULT 'system';
