-- 🛡️ Storage add-ons never sold at a loss (Raj, 2026-11-11). R2 charges for storage every month, so a yearly storage
-- add-on is 12 months, not 10; and every price keeps a 20% cushion against the currency with the storage 100% full
-- (R2 $0.015/GB-month plus operations, after Stripe's fees). Plans and the other add-ons are unchanged.
-- The add-ons' own US-dollar prices (the US and every country in no territory):
UPDATE "services" SET "price" = 11, "price_annual" = 132 WHERE "name" = '+500 GB storage' AND "is_addon" = true;
UPDATE "services" SET "price" = 21, "price_annual" = 252 WHERE "name" = '+1 TB storage' AND "is_addon" = true;
UPDATE "services" SET "price" = 42, "price_annual" = 504 WHERE "name" = '+2 TB storage' AND "is_addon" = true;
-- Each territory's fixed price:
UPDATE "addon_region_prices" a SET "monthly" = v.monthly, "annual" = v.monthly * 12
FROM (VALUES
  ('USD-R', '+500 GB storage', 12),
  ('USD-R', '+1 TB storage', 24),
  ('USD-R', '+2 TB storage', 48),
  ('GBP', '+500 GB storage', 9),
  ('GBP', '+1 TB storage', 17),
  ('GBP', '+2 TB storage', 34),
  ('EUR', '+500 GB storage', 10),
  ('EUR', '+1 TB storage', 20),
  ('EUR', '+2 TB storage', 40),
  ('CAD', '+500 GB storage', 18),
  ('CAD', '+1 TB storage', 35),
  ('CAD', '+2 TB storage', 70),
  ('AUD', '+500 GB storage', 17),
  ('AUD', '+1 TB storage', 32),
  ('AUD', '+2 TB storage', 64),
  ('NZD', '+500 GB storage', 20),
  ('NZD', '+1 TB storage', 39),
  ('NZD', '+2 TB storage', 78),
  ('SGD', '+500 GB storage', 15),
  ('SGD', '+1 TB storage', 28),
  ('SGD', '+2 TB storage', 56),
  ('AED', '+500 GB storage', 44),
  ('AED', '+1 TB storage', 84),
  ('AED', '+2 TB storage', 169),
  ('SAR', '+500 GB storage', 44),
  ('SAR', '+1 TB storage', 84),
  ('SAR', '+2 TB storage', 169),
  ('MXN', '+500 GB storage', 299),
  ('MXN', '+1 TB storage', 499),
  ('MXN', '+2 TB storage', 999),
  ('ZAR', '+500 GB storage', 249),
  ('ZAR', '+1 TB storage', 399),
  ('ZAR', '+2 TB storage', 799),
  ('BRL', '+500 GB storage', 64),
  ('BRL', '+1 TB storage', 124),
  ('BRL', '+2 TB storage', 249),
  ('MYR', '+500 GB storage', 49),
  ('MYR', '+1 TB storage', 94),
  ('MYR', '+2 TB storage', 189),
  ('INR', '+500 GB storage', 1099),
  ('INR', '+1 TB storage', 2099),
  ('INR', '+2 TB storage', 4199),
  ('PHP', '+500 GB storage', 799),
  ('PHP', '+1 TB storage', 1399),
  ('PHP', '+2 TB storage', 2799),
  ('IDR', '+500 GB storage', 249000),
  ('IDR', '+1 TB storage', 399000),
  ('IDR', '+2 TB storage', 799000),
  ('NGN', '+500 GB storage', 15900),
  ('NGN', '+1 TB storage', 29900),
  ('NGN', '+2 TB storage', 59900)
) AS v(region, name, monthly)
JOIN "price_regions" r ON r."code" = v.region
JOIN "services" s ON s."name" = v.name AND s."is_addon" = true
WHERE a."region_id" = r."id" AND a."service_id" = s."id";
