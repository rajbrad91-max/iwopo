-- 📋 The decided plans and add-ons (Raj, 2026-11-06) — data, written to be safe to run on any database: on staging it changes
-- nothing (already in place), on live it renames Studio Special → Studio and Vendor Suite → Essential (ids kept, so every
-- subscription carries over), adds Pro and Free, sets what each unlocks, and adds the storage / Crew / domain / social AI add-ons.

UPDATE "plans" SET "code"='studio', "name"='Studio', "price_monthly"=59, "price_annual"=590, "storage_gb"=1000,
  "tagline"='For busy studios and teams', "icon"='👑', "sort_order"=3, "chat_limit"=2000,
  "highlights"='[{"label":"Priority support"},{"label":"First access to new features"},{"label":"Instagram & WhatsApp AI at half price","coming":true},{"label":"Video streaming, YouTube-style","coming":true}]'
  WHERE "code" IN ('studio_special', 'studio');
UPDATE "plans" SET "code"='essential', "name"='Essential', "price_monthly"=19, "price_annual"=190, "storage_gb"=50,
  "tagline"='Everything to run your bookings', "icon"='✨', "sort_order"=1, "chat_limit"=100, "highlights"='[]'
  WHERE "code" IN ('vendor_suite', 'essential');
INSERT INTO "plans" ("code", "name", "price_monthly", "price_annual", "storage_gb", "tagline", "icon", "sort_order", "chat_limit", "highlights") VALUES
  ('pro', 'Pro', 39, 390, 300, 'Deliver photos, video and big files', '⭐', 2, 500, '[]'),
  ('free', 'Free', 0, 0, 1, 'Start taking enquiries', '🌱', 0, 0, '[{"label":"Powered by iwopo on your form"}]')
  ON CONFLICT ("code") DO UPDATE SET "name"=EXCLUDED."name", "price_monthly"=EXCLUDED."price_monthly", "price_annual"=EXCLUDED."price_annual",
    "storage_gb"=EXCLUDED."storage_gb", "tagline"=EXCLUDED."tagline", "icon"=EXCLUDED."icon", "sort_order"=EXCLUDED."sort_order",
    "chat_limit"=EXCLUDED."chat_limit", "highlights"=EXCLUDED."highlights";

-- 🔓 what each plan unlocks (public features only — private tools stay per-vendor overrides)
DELETE FROM "plan_features" WHERE "plan_id" IN (SELECT "id" FROM "plans" WHERE "code" IN ('free', 'essential', 'pro', 'studio'));
INSERT INTO "plan_features" ("plan_id", "feature_key")
  SELECT p."id", f.k FROM "plans" p JOIN (VALUES
    ('free', 'leads'),
    ('essential', 'leads'), ('essential', 'contracts'), ('essential', 'calendar'), ('essential', 'website'), ('essential', 'chatbot'),
    ('pro', 'leads'), ('pro', 'contracts'), ('pro', 'calendar'), ('pro', 'website'), ('pro', 'chatbot'), ('pro', 'galleries'), ('pro', 'fileflyer'), ('pro', 'crew'),
    ('studio', 'leads'), ('studio', 'contracts'), ('studio', 'calendar'), ('studio', 'website'), ('studio', 'chatbot'), ('studio', 'galleries'),
    ('studio', 'fileflyer'), ('studio', 'crew'), ('studio', 'custom_domain')
  ) AS f(code, k) ON p."code" = f.code;

-- ➕ add-ons
UPDATE "services" SET "price"=5, "price_annual"=50, "is_addon"=true, "plan_codes"='["essential"]',
  "description"='Crew & team on the day — included in Pro and Studio' WHERE "feature_key"='crew';
UPDATE "services" SET "price"=5, "price_annual"=50, "is_addon"=true, "plan_codes"='["essential","pro"]',
  "description"='Point your own domain to your iwopo website — included in Studio' WHERE "feature_key"='custom_domain';
-- galleries, AI chat and File Flyer come with a plan now — no price of their own
UPDATE "services" SET "price"=0, "price_annual"=NULL, "tiers"=NULL WHERE "feature_key" IN ('galleries', 'chatbot', 'fileflyer');
INSERT INTO "services" ("name", "icon", "price", "price_annual", "is_addon", "is_live", "is_private", "storage_gb", "description")
  SELECT v.name, '💾', v.m, v.y, true, true, false, v.gb, 'Extra storage on any plan'
  FROM (VALUES ('+500 GB storage', 10, 100, 500), ('+1 TB storage', 20, 200, 1000), ('+2 TB storage', 40, 400, 2000)) AS v(name, m, y, gb)
  WHERE NOT EXISTS (SELECT 1 FROM "services" s WHERE s."name" = v.name);
INSERT INTO "services" ("name", "icon", "price", "price_annual", "is_addon", "is_live", "is_private", "feature_key", "plan_prices", "description")
  SELECT 'Instagram & WhatsApp AI', '📱', 15, 150, true, false, false, 'social_ai', '{"studio": 7.5}',
    'Wopo Assistant on your Instagram and WhatsApp — half price on Studio'
  WHERE NOT EXISTS (SELECT 1 FROM "services" WHERE "feature_key" = 'social_ai');
