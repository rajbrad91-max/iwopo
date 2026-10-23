-- CreateTable
CREATE TABLE "followups" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "channel" VARCHAR(12) NOT NULL,
    "thread_key" VARCHAR(120) NOT NULL,
    "who" VARCHAR(160) NOT NULL,
    "contact" VARCHAR(200),
    "snippet" TEXT,
    "last_inbound_at" TIMESTAMP(6) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "snooze_until" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "followups_vendor_id_channel_thread_key_key" ON "followups"("vendor_id", "channel", "thread_key");

-- AddForeignKey
ALTER TABLE "followups" ADD CONSTRAINT "followups_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

