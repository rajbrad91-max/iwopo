-- 🧾 How a folder's prices speak about tax (Raj, 2026-11-13): 'included' (with its %), 'excluded' ("plus tax"), or
-- 'none' (not mentioned). Copied onto a lead with its packages, so a sent offer keeps the wording it was sent with.
ALTER TABLE "package_templates" ADD COLUMN "tax_mode" VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE "package_templates" ADD COLUMN "tax_rate" DECIMAL(5,2);
ALTER TABLE "lead_packages" ADD COLUMN "tax_mode" VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE "lead_packages" ADD COLUMN "tax_rate" DECIMAL(5,2);
