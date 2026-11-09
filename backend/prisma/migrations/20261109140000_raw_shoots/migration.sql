-- 📸 Raw Selector shoots (Raj, 2026-11-09): a booking's shoot album and the photographer who uploads it.
ALTER TABLE "lead_crew" ADD COLUMN IF NOT EXISTS "uploads" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crew_members" ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(100);
ALTER TABLE "crew_members" ADD COLUMN IF NOT EXISTS "joined_at" TIMESTAMP(6);
ALTER TABLE "crew_members" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(6);
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "lead_id" INTEGER;
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "source_album_id" INTEGER;
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "editor_note" TEXT;
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "uploaded_at" TIMESTAMP(6);
ALTER TABLE "albums" ADD CONSTRAINT "albums_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX IF NOT EXISTS "idx_albums_lead" ON "albums"("lead_id");
ALTER TABLE "albums" ADD CONSTRAINT "albums_source_album_id_fkey" FOREIGN KEY ("source_album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
