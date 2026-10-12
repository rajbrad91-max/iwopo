-- CreateTable
CREATE TABLE "agent_notices" (
    "vendor_id" INTEGER NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_notices_pkey" PRIMARY KEY ("vendor_id","day","key")
);

-- AddForeignKey
ALTER TABLE "agent_notices" ADD CONSTRAINT "agent_notices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

