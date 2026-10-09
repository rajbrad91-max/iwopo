-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "comms_events" (
    "id" BIGSERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "external_id" VARCHAR(80) NOT NULL,
    "line_id" VARCHAR(40),
    "kind" VARCHAR(12) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "status" VARCHAR(24),
    "from_number" VARCHAR(32),
    "to_number" VARCHAR(32),
    "contact_name" VARCHAR(160),
    "body" TEXT,
    "transcript" TEXT,
    "recording_url" VARCHAR(500),
    "duration_sec" INTEGER,
    "occurred_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enriched_at" TIMESTAMP(6),
    "lead_state" VARCHAR(12),
    "lead_asked_at" TIMESTAMP(6),
    "lead_id" INTEGER,
    "booking_state" VARCHAR(12),
    "booking_hint" VARCHAR(300),
    "checked_at" TIMESTAMP(6),

    CONSTRAINT "comms_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_notices" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "type" VARCHAR(40) DEFAULT 'comms',
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(400),
    "seen_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "link_type" VARCHAR(20),
    "link_id" INTEGER,

    CONSTRAINT "comms_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_comms_external" ON "comms_events"("external_id");

-- CreateIndex
CREATE INDEX "idx_comms_party" ON "comms_events"("vendor_id", "from_number", "to_number");

-- CreateIndex
CREATE INDEX "idx_comms_vendor" ON "comms_events"("vendor_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_comms_line" ON "comms_events"("vendor_id", "line_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_cnotice_vendor" ON "comms_notices"("vendor_id", "seen_at");

