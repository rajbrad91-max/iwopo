-- 💳 Billing with Stripe (2026-10-31)
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "price_annual" DECIMAL(8,2);
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "stripe_product_id" VARCHAR(64);
ALTER TABLE "vendor_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" VARCHAR(64);
ALTER TABLE "vendor_subscriptions" ADD COLUMN IF NOT EXISTS "billing_cycle" VARCHAR(10);
ALTER TABLE "vendor_subscriptions" ADD COLUMN IF NOT EXISTS "current_period_end" TIMESTAMPTZ(6);
ALTER TABLE "vendor_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_subscriptions_stripe_subscription_id_key" ON "vendor_subscriptions"("stripe_subscription_id");
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "stripe_customer_id" VARCHAR(64);
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMPTZ(6);
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "billing_exempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "trial_reminders" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "vendors_stripe_customer_id_key" ON "vendors"("stripe_customer_id");

-- Raj: yearly = 20% off; existing vendors get a fresh 30 days from launch day; his own studio is never billed
UPDATE "plans" SET "price_annual" = ROUND("price_monthly" * 12 * 0.8, 2) WHERE "price_annual" IS NULL;
UPDATE "vendors" SET "trial_ends_at" = NOW() + INTERVAL '30 days' WHERE "trial_ends_at" IS NULL;
UPDATE "vendors" SET "billing_exempt" = true, "status" = 'active' WHERE "slug" = 'perfect-poses-media';
