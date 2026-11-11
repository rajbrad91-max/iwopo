-- 💰 What a subscription is charged — its currency and one billing period's amount (plan and add-ons), recorded from
-- Stripe — so Super Admin's revenue is what subscribers really pay, not the US-dollar list price (Raj, 2026-11-11).
ALTER TABLE "vendor_subscriptions" ADD COLUMN "currency" VARCHAR(3);
ALTER TABLE "vendor_subscriptions" ADD COLUMN "amount" DECIMAL(14,2);
