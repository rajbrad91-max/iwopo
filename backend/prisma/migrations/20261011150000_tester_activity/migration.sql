-- CreateTable
CREATE TABLE "tester_activity" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "started_at" TIMESTAMP(6) NOT NULL,
    "ended_at" TIMESTAMP(6) NOT NULL,
    "source" VARCHAR(8) NOT NULL DEFAULT 'live',

    CONSTRAINT "tester_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_tester_activity_user" ON "tester_activity"("user_id", "started_at");

