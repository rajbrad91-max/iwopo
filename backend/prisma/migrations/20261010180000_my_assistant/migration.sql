-- CreateTable
CREATE TABLE "agent_usage" (
    "vendor_id" INTEGER NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_micro" BIGINT NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_usage_pkey" PRIMARY KEY ("vendor_id","month")
);

-- AddForeignKey
ALTER TABLE "agent_usage" ADD CONSTRAINT "agent_usage_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- 🤖 My Assistant: a PRIVATE feature (never in the catalogue, plans or SEO
-- pages), off for every vendor until Super Admin switches it on per vendor.
INSERT INTO "services" ("name", "icon", "price", "feature_key", "is_live", "is_private", "description")
VALUES ('My Assistant', '🤖', 0, 'agent', true, true, 'Private: an AI assistant that reads the vendor panel')
ON CONFLICT ("feature_key") DO NOTHING;
