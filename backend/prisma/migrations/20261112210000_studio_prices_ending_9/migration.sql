-- 💰 Studio prices ending in 9, yearly saving 21-25% (Raj, 2026-11-12): monthly raised everywhere so paying yearly is the
-- clear choice; some yearly prices move slightly to end in 9. Existing subscribers keep the price they signed up with.
UPDATE "plans" SET "price_monthly" = 69, "price_annual" = 649 WHERE "code" = 'studio';
UPDATE "plan_region_prices" p SET "monthly" = v.m, "annual" = v.a
FROM (VALUES ('USD-R', 59, 549), ('GBP', 59, 549), ('EUR', 69, 649), ('CAD', 99, 919), ('AUD', 99, 929), ('NZD', 119, 1099), ('SGD', 89, 829), ('AED', 259, 2399), ('SAR', 269, 2499), ('MXN', 1149, 10799), ('ZAR', 879, 8199), ('BRL', 279, 2599), ('MYR', 219, 2049), ('INR', 3999, 35999), ('PHP', 2999, 27999), ('IDR', 749000, 6999000), ('NGN', 52999, 499999), ('USD', 69, 649)) AS v(code, m, a), "price_regions" r
WHERE p."region_id" = r."id" AND r."code" = v.code AND p."plan_id" = (SELECT "id" FROM "plans" WHERE "code" = 'studio');
