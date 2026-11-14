-- 📧 when the client was emailed their signed contract (sent once, when the booking is confirmed)
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "client_copy_sent_at" TIMESTAMP(6);
