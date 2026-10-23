-- 🕐 when the call or text actually happened (Quo's time); created_at = when iwopo imported it
ALTER TABLE "comms_notices" ADD COLUMN "occurred_at" TIMESTAMP(6);
-- the notices already there get their call's / text's own time
UPDATE "comms_notices" n SET "occurred_at" = e."occurred_at" FROM "comms_events" e WHERE n."link_type" = 'comms' AND n."link_id" = e."id";
