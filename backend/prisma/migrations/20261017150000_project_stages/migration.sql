-- CreateTable
CREATE TABLE "project_stages" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "backed_up_at" TIMESTAMP(6),
    "backed_up_by" VARCHAR(80) NOT NULL DEFAULT '',
    "sent_to_editor_at" TIMESTAMP(6),
    "editing_photos_done_at" TIMESTAMP(6),
    "editing_videos_done_at" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outside_messages" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'other',
    "direction" VARCHAR(4) NOT NULL DEFAULT 'out',
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" VARCHAR(80) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outside_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "lead_id" INTEGER,
    "to_email" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(300) NOT NULL DEFAULT '',
    "kind" VARCHAR(40) NOT NULL DEFAULT '',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT NOT NULL DEFAULT '',
    "sent_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_stages_lead_id_key" ON "project_stages"("lead_id");

-- CreateIndex
CREATE INDEX "idx_stages_vendor" ON "project_stages"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_outside_msgs_lead" ON "outside_messages"("vendor_id", "lead_id");

-- CreateIndex
CREATE INDEX "idx_email_log_lead" ON "email_log"("vendor_id", "lead_id");

-- CreateIndex
CREATE INDEX "idx_email_log_to" ON "email_log"("vendor_id", "to_email");

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "outside_messages" ADD CONSTRAINT "outside_messages_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "outside_messages" ADD CONSTRAINT "outside_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

