-- 🔗 optional links on a vendor's client pages (Raj, 2026-11-08)
CREATE TABLE IF NOT EXISTS "client_links" (
  "vendor_id" INTEGER NOT NULL PRIMARY KEY REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "title_url" VARCHAR(300), "private_url" VARCHAR(300),
  "button1_label" VARCHAR(40), "button1_url" VARCHAR(300), "button2_label" VARCHAR(40), "button2_url" VARCHAR(300),
  "instagram" VARCHAR(300), "facebook" VARCHAR(300), "youtube" VARCHAR(300), "tiktok" VARCHAR(300), "pinterest" VARCHAR(300), "whatsapp" VARCHAR(300),
  "footer_phone" VARCHAR(40), "footer_email" VARCHAR(160), "footer_address" VARCHAR(200),
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
