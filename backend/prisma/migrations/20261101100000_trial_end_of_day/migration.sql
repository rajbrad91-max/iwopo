-- 🟠 Trials end at the end of their last day (UTC), so iwopo and Stripe count the same days (2026-11-01). Idempotent.
UPDATE "vendors"
SET "trial_ends_at" = (date_trunc('day', "trial_ends_at" AT TIME ZONE 'UTC') + INTERVAL '1 day' - INTERVAL '1 second') AT TIME ZONE 'UTC'
WHERE "trial_ends_at" IS NOT NULL;
