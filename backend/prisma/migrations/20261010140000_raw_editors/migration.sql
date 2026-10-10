-- CreateTable
CREATE TABLE "raw_editors" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "name" VARCHAR(120),
    "password_hash" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMP(6),
    "last_login_at" TIMESTAMP(6),
    "revoked_at" TIMESTAMP(6),

    CONSTRAINT "raw_editors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_raw_editors_email" ON "raw_editors"("email");

-- CreateIndex
CREATE UNIQUE INDEX "raw_editors_vendor_email" ON "raw_editors"("vendor_id", "email");

-- AddForeignKey
ALTER TABLE "raw_editors" ADD CONSTRAINT "raw_editors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

