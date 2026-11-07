-- 💳 the plan a new account chose, remembered until it is paid for (Raj, 2026-11-07)
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pending_plan_id" INTEGER;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pending_cycle" VARCHAR(10);
