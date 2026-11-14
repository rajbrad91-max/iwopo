-- 🔐 two-step sign-in per account: on for everyone, as it has been, until its holder turns it off
ALTER TABLE "users" ADD COLUMN "two_step_enabled" BOOLEAN NOT NULL DEFAULT true;

-- the Settings → Security list is gone (Raj, 2026-11-14); a new device is now an email instead
DROP TABLE "security_events";
