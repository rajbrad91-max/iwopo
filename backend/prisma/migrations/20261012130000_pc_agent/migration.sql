-- CreateTable
CREATE TABLE "pc_devices" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "last_seen" TIMESTAMP(6),
    "info" TEXT,
    "revoked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pc_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pc_jobs" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "device_id" INTEGER NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "params" TEXT NOT NULL DEFAULT '{}',
    "status" VARCHAR(12) NOT NULL DEFAULT 'queued',
    "progress" TEXT,
    "result" TEXT,
    "summary" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pc_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pc_devices_token_hash_key" ON "pc_devices"("token_hash");

-- CreateIndex
CREATE INDEX "idx_pc_jobs_device_status" ON "pc_jobs"("device_id", "status");

-- AddForeignKey
ALTER TABLE "pc_devices" ADD CONSTRAINT "pc_devices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pc_jobs" ADD CONSTRAINT "pc_jobs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pc_jobs" ADD CONSTRAINT "pc_jobs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "pc_devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

