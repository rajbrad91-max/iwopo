-- 📝 "Join the waitlist" on the public page while sign-ups are paused (Raj, 2026-11-12)
CREATE TABLE "waitlist" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "waitlist_email_key" ON "waitlist"("email");
