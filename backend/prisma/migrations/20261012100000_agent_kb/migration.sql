-- CreateTable
CREATE TABLE "agent_kb" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "section" VARCHAR(30) NOT NULL,
    "ref" VARCHAR(120) NOT NULL,
    "text" TEXT NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_kb_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_agent_kb_section" ON "agent_kb"("vendor_id", "section");

-- CreateIndex
CREATE UNIQUE INDEX "uq_agent_kb_vendor_ref" ON "agent_kb"("vendor_id", "ref");

-- AddForeignKey
ALTER TABLE "agent_kb" ADD CONSTRAINT "agent_kb_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

