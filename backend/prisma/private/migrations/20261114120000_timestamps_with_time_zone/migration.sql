-- 🕐 Timestamps "with time zone", column by column (audit 2026-11-14). Every value was written in UTC (the app sends UTC,
-- and the database's own clock is UTC), so each is read AT TIME ZONE 'UTC': the moment it records stays exactly the
-- same — checked column by column before and after. One type everywhere means a future server or session in another
-- time zone can never shift a date.
ALTER TABLE "comms_events"
  ALTER COLUMN "occurred_at" TYPE timestamptz(6) USING "occurred_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "enriched_at" TYPE timestamptz(6) USING "enriched_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "lead_asked_at" TYPE timestamptz(6) USING "lead_asked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "checked_at" TYPE timestamptz(6) USING "checked_at" AT TIME ZONE 'UTC';
ALTER TABLE "comms_notices"
  ALTER COLUMN "seen_at" TYPE timestamptz(6) USING "seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "occurred_at" TYPE timestamptz(6) USING "occurred_at" AT TIME ZONE 'UTC';
