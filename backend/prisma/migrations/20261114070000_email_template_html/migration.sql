-- 🧑‍💻 an email template can be sent as the vendor's own HTML design
ALTER TABLE "vendor_email_templates" ADD COLUMN "mode" VARCHAR(10) NOT NULL DEFAULT 'text';
ALTER TABLE "vendor_email_templates" ADD COLUMN "html" TEXT;
