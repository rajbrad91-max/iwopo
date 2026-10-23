-- 🕐 when a notification's event actually happened (e.g. the email's own time); created_at = when iwopo noticed it
ALTER TABLE "notifications" ADD COLUMN "occurred_at" TIMESTAMP(6);
