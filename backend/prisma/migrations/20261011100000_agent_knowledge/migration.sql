-- CreateTable
CREATE TABLE "agent_memory" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'memory',
    "text" VARCHAR(600) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_briefing" (
    "vendor_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_briefing_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateIndex
CREATE INDEX "idx_agent_memory_vendor" ON "agent_memory"("vendor_id");

-- AddForeignKey
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_briefing" ADD CONSTRAINT "agent_briefing_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

