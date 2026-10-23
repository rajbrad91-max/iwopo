-- CreateTable
CREATE TABLE "email_inquiries" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "thread_id" VARCHAR(40) NOT NULL,
    "is_inquiry" BOOLEAN NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "from_addr" VARCHAR(200),
    "subject" VARCHAR(300),
    "last_at" TIMESTAMP(6) NOT NULL,
    "checked_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_inquiries_vendor_id_is_inquiry_last_at_idx" ON "email_inquiries"("vendor_id", "is_inquiry", "last_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_inquiries_vendor_id_thread_id_key" ON "email_inquiries"("vendor_id", "thread_id");

-- AddForeignKey
ALTER TABLE "email_inquiries" ADD CONSTRAINT "email_inquiries_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

