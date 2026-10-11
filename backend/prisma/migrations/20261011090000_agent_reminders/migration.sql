-- CreateTable
CREATE TABLE "agent_reminders" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(12) NOT NULL DEFAULT 'task',
    "due_at" TIMESTAMP(6) NOT NULL,
    "done_at" TIMESTAMP(6),
    "last_alert_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_agent_reminders_open" ON "agent_reminders"("vendor_id", "done_at");

-- AddForeignKey
ALTER TABLE "agent_reminders" ADD CONSTRAINT "agent_reminders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

