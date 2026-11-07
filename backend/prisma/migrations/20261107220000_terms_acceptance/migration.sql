-- 📜 the Terms a person agreed to at sign-up: when, and which version (Raj, 2026-11-07)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(6);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version" VARCHAR(20);
