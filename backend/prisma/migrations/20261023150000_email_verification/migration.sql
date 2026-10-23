-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "email_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" VARCHAR(10) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "new_email" VARCHAR(254),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_codes_user_id_purpose_idx" ON "email_codes"("user_id", "purpose");

-- AddForeignKey
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- ✉️ every account that exists today counts as confirmed; only new sign-ups confirm by code
UPDATE "users" SET "email_verified_at" = COALESCE("email_verified_at", CURRENT_TIMESTAMP);
