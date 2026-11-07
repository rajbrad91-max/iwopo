-- 📬 a vendor's consent to offers and news — off unless they tick it (Raj, 2026-11-07)
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "marketing_opt_in_at" TIMESTAMP(6);
