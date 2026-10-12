-- CreateTable
CREATE TABLE "agent_rules" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "text" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_rule_history" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "run_id" INTEGER,
    "key" VARCHAR(60) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "old_text" TEXT,
    "new_text" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_rule_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_training_runs" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(10) NOT NULL,
    "summary" TEXT,
    "chars_before" INTEGER,
    "chars_after" INTEGER,
    "conversations" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "refused" TEXT,
    "undone_at" TIMESTAMP(6),

    CONSTRAINT "agent_training_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_log" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tool" VARCHAR(60) NOT NULL,
    "args" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "error" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "agent_tool_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_agent_rules_vendor_key" ON "agent_rules"("vendor_id", "key");

-- CreateIndex
CREATE INDEX "idx_agent_rule_history_run" ON "agent_rule_history"("vendor_id", "run_id");

-- CreateIndex
CREATE INDEX "idx_agent_training_runs_vendor" ON "agent_training_runs"("vendor_id", "at");

-- CreateIndex
CREATE INDEX "idx_agent_tool_log_vendor" ON "agent_tool_log"("vendor_id", "at");

-- AddForeignKey
ALTER TABLE "agent_rules" ADD CONSTRAINT "agent_rules_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_rule_history" ADD CONSTRAINT "agent_rule_history_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_training_runs" ADD CONSTRAINT "agent_training_runs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_tool_log" ADD CONSTRAINT "agent_tool_log_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

