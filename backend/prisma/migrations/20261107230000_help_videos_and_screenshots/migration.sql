-- 📎 a screenshot on a support message; 🎬 video guides for Help & Support (Raj, 2026-11-07)
ALTER TABLE "support_messages" ADD COLUMN IF NOT EXISTS "attachment_key" VARCHAR(300);
ALTER TABLE "support_messages" ADD COLUMN IF NOT EXISTS "attachment_type" VARCHAR(40);
CREATE TABLE IF NOT EXISTS "help_videos" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(140) NOT NULL,
  "youtube_id" VARCHAR(20) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);
