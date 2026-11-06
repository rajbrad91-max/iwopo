-- ➕ add-ons (storage, Crew, own domain, Instagram & WhatsApp AI) and 🎟️ coupons mirrored in Stripe (2026-11-06)
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "storage_gb" INTEGER;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "plan_codes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "plan_prices" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "stripe_coupon_id" VARCHAR(64);
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "stripe_promo_id" VARCHAR(64);
