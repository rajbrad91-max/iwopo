-- ⏳ There is no Free plan any more (Raj, 2026-11-15): a vendor whose access ends goes read-only, then suspended, then
-- cleared (lib/accountLapse.js). Its plan features and regional prices go with it.
DELETE FROM "plans" WHERE "code" = 'free';

ALTER TABLE "vendors" ADD COLUMN "lapsed_at" TIMESTAMPTZ(6),
  ADD COLUMN "lapse_step" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lapse_step_at" TIMESTAMPTZ(6);

-- the Free plan's idle clean-up, and the sign-in stamp it counted from
ALTER TABLE "vendor_settings" DROP COLUMN "inactive_stage", DROP COLUMN "inactive_notice_at";
ALTER TABLE "users" DROP COLUMN "last_seen_at";
