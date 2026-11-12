-- 💰 Pro prices end in 9 or 5 (Raj, 2026-11-12): the closest such price, the same ~17% yearly saving as before. Monthly
-- prices are unchanged except Nigeria (19,900 → 19,899); every yearly price drops by one. Existing subscribers keep theirs.
UPDATE "plans" SET "price_monthly" = 39, "price_annual" = 389 WHERE "code" = 'pro';
UPDATE "plan_region_prices" p SET "monthly" = v.m, "annual" = v.a
FROM (VALUES ('USD-R', 25, 249), ('GBP', 29, 289), ('EUR', 35, 349), ('CAD', 49, 489), ('AUD', 55, 549), ('NZD', 65, 649), ('SGD', 49, 489), ('AED', 145, 1449), ('SAR', 149, 1489), ('MXN', 499, 4989), ('ZAR', 399, 3989), ('BRL', 119, 1189), ('MYR', 99, 989), ('INR', 1499, 14989), ('PHP', 1199, 11989), ('IDR', 299000, 2989000), ('NGN', 19899, 198999), ('USD', 39, 389)) AS v(code, m, a), "price_regions" r
WHERE p."region_id" = r."id" AND r."code" = v.code AND p."plan_id" = (SELECT "id" FROM "plans" WHERE "code" = 'pro');
