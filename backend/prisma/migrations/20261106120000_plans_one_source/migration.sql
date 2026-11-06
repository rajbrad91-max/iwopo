-- 📋 plans are the ONE source for every plan's price, storage, chat limit and what it unlocks (2026-11-06)
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "tagline" VARCHAR(160);
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "icon" VARCHAR(16);
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "chat_limit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "highlights" JSONB NOT NULL DEFAULT '[]';
