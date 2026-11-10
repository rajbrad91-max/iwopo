-- 🛤️ Raw Selector rail (Raj, 2026-11-10): who uploaded, the RAWs received (when, by whom), the client's full download.
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "uploaded_by" VARCHAR(80);
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "raws_received_at" TIMESTAMP(6);
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "raws_received_by" VARCHAR(80);
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "downloads_complete_at" TIMESTAMP(6);
