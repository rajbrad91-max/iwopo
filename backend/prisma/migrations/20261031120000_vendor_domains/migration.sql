-- 🌐 Vendor addresses (2026-10-31): automatic custom domains need to say what happened and when.
ALTER TABLE "vendor_sites" ADD COLUMN IF NOT EXISTS "domain_error" VARCHAR(300);
ALTER TABLE "vendor_sites" ADD COLUMN IF NOT EXISTS "domain_checked_at" TIMESTAMPTZ(6);
ALTER TABLE "vendor_sites" ADD COLUMN IF NOT EXISTS "domain_live_at" TIMESTAMPTZ(6);

-- The plan feature that unlocks a vendor's own domain and removes "Powered by iwopo". Not sold on its own
-- (is_live = false keeps it out of the public catalogue); granted through a plan. Raj: only the highest plan.
INSERT INTO "services" ("name", "icon", "price", "feature_key", "is_live", "is_private", "description")
VALUES ('Own domain & branding', '🌐', 0, 'custom_domain', false, false, 'Client pages on your own domain, with your name instead of iwopo')
ON CONFLICT ("feature_key") DO NOTHING;
INSERT INTO "plan_features" ("plan_id", "feature_key")
SELECT "id", 'custom_domain' FROM "plans" ORDER BY "price_monthly" DESC, "id" DESC LIMIT 1
ON CONFLICT DO NOTHING;
