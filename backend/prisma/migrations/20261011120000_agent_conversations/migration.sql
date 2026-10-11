-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "transcript" TEXT,
    "started_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_agent_conversations_vendor" ON "agent_conversations"("vendor_id", "created_at");

-- AddForeignKey
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

