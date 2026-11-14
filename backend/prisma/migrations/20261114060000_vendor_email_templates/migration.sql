-- ✉️ each vendor's own wording for the emails iwopo sends their clients
CREATE TABLE "vendor_email_templates" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_email_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendor_email_templates_vendor_id_kind_key" ON "vendor_email_templates"("vendor_id", "kind");
ALTER TABLE "vendor_email_templates" ADD CONSTRAINT "vendor_email_templates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
