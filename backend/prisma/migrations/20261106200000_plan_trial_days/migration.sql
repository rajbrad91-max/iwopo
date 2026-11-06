-- 🧪 the free trial is per plan: Essential and Pro 30 days, Studio and Free none (Raj, 2026-11-06)
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "trial_days" INTEGER NOT NULL DEFAULT 0;
UPDATE "plans" SET "trial_days" = 30 WHERE "code" IN ('essential', 'pro');
UPDATE "plans" SET "trial_days" = 0 WHERE "code" IN ('studio', 'free');
