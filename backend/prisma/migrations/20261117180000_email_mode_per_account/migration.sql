-- ✉️ One Plain text / HTML switch for all of a vendor's client emails (Raj, 2026-11-17), instead of one per email.
ALTER TABLE "vendor_settings" ADD COLUMN "email_mode" VARCHAR(10) NOT NULL DEFAULT 'text';

-- a vendor who sent any email as HTML keeps sending as HTML; every stored design and wording stays as it is
INSERT INTO "vendor_settings" ("vendor_id", "email_mode")
  SELECT DISTINCT "vendor_id", 'html' FROM "vendor_email_templates" WHERE "mode" = 'html'
  ON CONFLICT ("vendor_id") DO UPDATE SET "email_mode" = 'html';

ALTER TABLE "vendor_email_templates" DROP COLUMN "mode";
