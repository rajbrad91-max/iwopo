-- 🗑️ Raw Selector (Raj, 2026-11-09): RAWs are never deleted by a clock — only when the vendor says so (all, or the
-- ones the client did not pick; albums.raws_removed_*). The 30-day delete-after date goes.
ALTER TABLE "raw_files" DROP COLUMN IF EXISTS "delete_after";
