-- 💰 Studio's monthly price raised in every territory so that paying yearly saves about 17%, like Essential and Pro
-- (Raj, 2026-11-12). Studio's yearly prices are unchanged. Existing subscribers keep the price they signed up with.
UPDATE "plans" SET "price_monthly" = 65 WHERE "code" = 'studio';
UPDATE "plan_region_prices" p SET "monthly" = v.m
FROM (VALUES ('USD', 65), ('USD-R', 54), ('GBP', 50), ('EUR', 61), ('CAD', 93), ('AUD', 94), ('NZD', 109), ('SGD', 83), ('AED', 249), ('SAR', 259), ('MXN', 1049), ('ZAR', 829), ('BRL', 269), ('MYR', 209), ('INR', 3649), ('PHP', 2749), ('IDR', 719000), ('NGN', 48900)) AS v(code, m), "price_regions" r
WHERE p."region_id" = r."id" AND r."code" = v.code AND p."plan_id" = (SELECT "id" FROM "plans" WHERE "code" = 'studio');
