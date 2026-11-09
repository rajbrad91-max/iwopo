-- 🗑️ Raw Selector (Raj, 2026-11-09): RAWs are removed only when the vendor says so — all, or those the client did not pick — and the rail keeps the record.
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "raws_removed_at" TIMESTAMP(6);
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "raws_removed_scope" VARCHAR(10);
