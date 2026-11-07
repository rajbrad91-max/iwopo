-- 📊 the rest of the PPM board's stages, so the panel board, the desktop board and Gale share them (Raj, 2026-11-07)
ALTER TABLE "project_stages" ADD COLUMN IF NOT EXISTS "delivery_due_at" TIMESTAMP(6);
ALTER TABLE "project_stages" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(6);
ALTER TABLE "project_stages" ADD COLUMN IF NOT EXISTS "review_asked_at" TIMESTAMP(6);
ALTER TABLE "project_stages" ADD COLUMN IF NOT EXISTS "download_reminder_at" TIMESTAMP(6);
