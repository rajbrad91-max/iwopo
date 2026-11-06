-- 🧹 Free inactive-account clean-up (2026-11-06)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ(6);
-- 🛡️ everyone counts from today: nobody can be cleaned up for at least seven months after this goes live
UPDATE "users" SET "last_seen_at" = now() WHERE "last_seen_at" IS NULL;
ALTER TABLE "vendor_settings" ADD COLUMN IF NOT EXISTS "inactive_stage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "vendor_settings" ADD COLUMN IF NOT EXISTS "inactive_notice_at" TIMESTAMPTZ(6);
