-- 📡 camera FTP (Raj, 2026-11-09): a photographer's FTP password (sealed) and the shoot his camera's uploads go to.
ALTER TABLE "crew_members" ADD COLUMN IF NOT EXISTS "ftp_password_enc" TEXT;
ALTER TABLE "crew_members" ADD COLUMN IF NOT EXISTS "ftp_lead_id" INTEGER;
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_ftp_lead_id_fkey" FOREIGN KEY ("ftp_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
