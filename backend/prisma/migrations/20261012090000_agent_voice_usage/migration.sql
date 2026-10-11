-- CreateTable
CREATE TABLE "agent_voice_usage" (
    "vendor_id" INTEGER NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "in_text" BIGINT NOT NULL DEFAULT 0,
    "in_audio" BIGINT NOT NULL DEFAULT 0,
    "out_text" BIGINT NOT NULL DEFAULT 0,
    "out_audio" BIGINT NOT NULL DEFAULT 0,
    "cost_micro" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_voice_usage_pkey" PRIMARY KEY ("vendor_id","day")
);

-- AddForeignKey
ALTER TABLE "agent_voice_usage" ADD CONSTRAINT "agent_voice_usage_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

