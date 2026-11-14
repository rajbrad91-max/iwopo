-- ✉️ The gallery email moves into Settings → Email templates ("Gallery shared"), so it is edited in one place.
-- Each vendor's saved gallery message is carried across word for word before the old column goes.
INSERT INTO "vendor_email_templates" ("vendor_id", "kind", "subject", "body", "mode", "updated_at")
SELECT "vendor_id", 'gallery_shared', 'Your Photos Are Ready 📸', "instructions_template", 'text', CURRENT_TIMESTAMP
FROM "album_settings"
WHERE "instructions_template" IS NOT NULL AND btrim("instructions_template") <> ''
ON CONFLICT ("vendor_id", "kind") DO NOTHING;

ALTER TABLE "album_settings" DROP COLUMN "instructions_template";
