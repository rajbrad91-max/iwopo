-- CreateTable
CREATE TABLE "agent_delivery_log" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER,
    "client_name" VARCHAR(120) NOT NULL DEFAULT '',
    "client_email" VARCHAR(160) NOT NULL DEFAULT '',
    "client_phone" VARCHAR(40) NOT NULL DEFAULT '',
    "album_id" INTEGER,
    "album_title" VARCHAR(200) NOT NULL DEFAULT '',
    "file_name" VARCHAR(260) NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "source_path" TEXT NOT NULL DEFAULT '',
    "action" VARCHAR(20) NOT NULL DEFAULT 'uploaded',
    "fee" DECIMAL(10,2),
    "note" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_delivery_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_delivery_email" ON "agent_delivery_log"("vendor_id", "client_email");

-- CreateIndex
CREATE INDEX "idx_delivery_phone" ON "agent_delivery_log"("vendor_id", "client_phone");

-- CreateIndex
CREATE INDEX "idx_delivery_lead" ON "agent_delivery_log"("vendor_id", "lead_id");

-- AddForeignKey
ALTER TABLE "agent_delivery_log" ADD CONSTRAINT "agent_delivery_log_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

