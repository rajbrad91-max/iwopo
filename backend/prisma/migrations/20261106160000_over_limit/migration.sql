-- 📏 over the plan's storage: when it started and which reminder went last (2026-11-06)
ALTER TABLE "vendor_settings" ADD COLUMN IF NOT EXISTS "over_limit_since" TIMESTAMPTZ(6);
ALTER TABLE "vendor_settings" ADD COLUMN IF NOT EXISTS "over_limit_stage" INTEGER NOT NULL DEFAULT 0;
