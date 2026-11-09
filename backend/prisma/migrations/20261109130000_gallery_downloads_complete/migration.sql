-- 🟢 "Every Zip downloaded" (Raj, 2026-11-09): which tab and part a Zip was, and the mark on the gallery once all are in.
ALTER TABLE "gallery_downloads" ADD COLUMN IF NOT EXISTS "event_id" INTEGER;
ALTER TABLE "gallery_downloads" ADD COLUMN IF NOT EXISTS "part" INTEGER;
ALTER TABLE "gallery_downloads" ADD COLUMN IF NOT EXISTS "parts" INTEGER;
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "downloads_complete_count" INTEGER;
