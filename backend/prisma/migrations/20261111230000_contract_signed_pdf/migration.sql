-- 🧊 A signed contract's PDF, frozen at signing and kept privately, with its own fingerprint (Raj, 2026-11-11)
ALTER TABLE "contracts" ADD COLUMN "pdf_key" VARCHAR(300);
ALTER TABLE "contracts" ADD COLUMN "pdf_sha256" VARCHAR(64);
