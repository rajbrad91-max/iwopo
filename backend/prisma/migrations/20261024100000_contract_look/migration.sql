-- 🎨 each contract template keeps its own look, chosen by the vendor
ALTER TABLE "contract_templates" ADD COLUMN "accent" VARCHAR(20) NOT NULL DEFAULT 'gold';
ALTER TABLE "contract_templates" ADD COLUMN "font_style" VARCHAR(20) NOT NULL DEFAULT 'classic';
