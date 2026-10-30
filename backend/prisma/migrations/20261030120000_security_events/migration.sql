-- 🛡️ Security log: sign-ins, wrong passwords, lock-outs, password changes (2026-10-30)
CREATE TABLE "security_events" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "vendor_id" INTEGER,
    "event" VARCHAR(40) NOT NULL,
    "ip" VARCHAR(64),
    "device" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at");
