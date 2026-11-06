-- 💳 Stripe Connect: the vendor's own Stripe account, and card payments recorded once (2026-11-06)
ALTER TABLE "vendor_settings" ADD COLUMN IF NOT EXISTS "stripe_account_id" VARCHAR(64);
ALTER TABLE "vendor_settings" ADD COLUMN IF NOT EXISTS "stripe_connected_at" TIMESTAMPTZ(6);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "reference" VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS "payments_reference_key" ON "payments"("reference");
