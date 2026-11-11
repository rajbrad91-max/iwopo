-- 🌍 Fixed local prices per territory (Raj, 2026-11-11), and Studio yearly = 11 months (1 month free).
CREATE TABLE "price_regions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "symbol" VARCHAR(6) NOT NULL,
    "countries" VARCHAR(2)[] DEFAULT ARRAY[]::VARCHAR(2)[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "price_regions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "price_regions_code_key" ON "price_regions"("code");
CREATE TABLE "plan_region_prices" (
    "id" SERIAL NOT NULL,
    "region_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "monthly" DECIMAL(14,2) NOT NULL,
    "annual" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "plan_region_prices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plan_region_prices_region_id_plan_id_key" ON "plan_region_prices"("region_id", "plan_id");
ALTER TABLE "plan_region_prices" ADD CONSTRAINT "plan_region_prices_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "price_regions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "plan_region_prices" ADD CONSTRAINT "plan_region_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

INSERT INTO "price_regions" ("code", "name", "currency", "symbol", "countries", "sort_order") VALUES
  ('USD', 'US & other countries', 'USD', '$', ARRAY[]::VARCHAR(2)[], 0),
  ('USD-R', 'Regional', 'USD', '$', ARRAY['LK', 'PK', 'BD', 'NP', 'BT', 'MV', 'VN', 'TH', 'KH', 'LA', 'MM', 'MN', 'KZ', 'UZ', 'EG', 'MA', 'TN', 'DZ', 'JO', 'LB', 'IQ', 'TR', 'KE', 'GH', 'ET', 'UG', 'TZ', 'RW', 'ZM', 'ZW', 'SN', 'CI', 'CM', 'CO', 'PE', 'AR', 'CL', 'EC', 'BO', 'PY', 'UY', 'GT', 'HN', 'SV', 'NI', 'DO', 'JM', 'UA', 'GE', 'AM', 'AZ', 'RS', 'BA', 'AL', 'MK', 'MD']::VARCHAR(2)[], 1),
  ('GBP', 'United Kingdom', 'GBP', '£', ARRAY['GB', 'IM', 'JE', 'GG']::VARCHAR(2)[], 2),
  ('EUR', 'Eurozone', 'EUR', '€', ARRAY['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK']::VARCHAR(2)[], 3),
  ('CAD', 'Canada', 'CAD', 'CA$', ARRAY['CA']::VARCHAR(2)[], 4),
  ('AUD', 'Australia', 'AUD', 'A$', ARRAY['AU']::VARCHAR(2)[], 5),
  ('NZD', 'New Zealand', 'NZD', 'NZ$', ARRAY['NZ']::VARCHAR(2)[], 6),
  ('SGD', 'Singapore', 'SGD', 'S$', ARRAY['SG']::VARCHAR(2)[], 7),
  ('AED', 'United Arab Emirates', 'AED', 'AED ', ARRAY['AE']::VARCHAR(2)[], 8),
  ('SAR', 'Saudi Arabia', 'SAR', 'SAR ', ARRAY['SA']::VARCHAR(2)[], 9),
  ('MXN', 'Mexico', 'MXN', 'MX$', ARRAY['MX']::VARCHAR(2)[], 10),
  ('ZAR', 'South Africa', 'ZAR', 'R', ARRAY['ZA']::VARCHAR(2)[], 11),
  ('BRL', 'Brazil', 'BRL', 'R$', ARRAY['BR']::VARCHAR(2)[], 12),
  ('MYR', 'Malaysia', 'MYR', 'RM', ARRAY['MY']::VARCHAR(2)[], 13),
  ('INR', 'India', 'INR', '₹', ARRAY['IN']::VARCHAR(2)[], 14),
  ('PHP', 'Philippines', 'PHP', '₱', ARRAY['PH']::VARCHAR(2)[], 15),
  ('IDR', 'Indonesia', 'IDR', 'Rp', ARRAY['ID']::VARCHAR(2)[], 16),
  ('NGN', 'Nigeria', 'NGN', '₦', ARRAY['NG']::VARCHAR(2)[], 17);
INSERT INTO "plan_region_prices" ("region_id", "plan_id", "monthly", "annual")
SELECT r."id", p."id", v.monthly, v.annual FROM (VALUES
  ('USD-R', 'essential', 12, 120),
  ('USD-R', 'pro', 25, 250),
  ('USD-R', 'studio', 49, 539),
  ('GBP', 'essential', 15, 150),
  ('GBP', 'pro', 29, 290),
  ('GBP', 'studio', 45, 495),
  ('EUR', 'essential', 17, 170),
  ('EUR', 'pro', 35, 350),
  ('EUR', 'studio', 55, 605),
  ('CAD', 'essential', 25, 250),
  ('CAD', 'pro', 49, 490),
  ('CAD', 'studio', 84, 924),
  ('AUD', 'essential', 29, 290),
  ('AUD', 'pro', 55, 550),
  ('AUD', 'studio', 85, 935),
  ('NZD', 'essential', 32, 320),
  ('NZD', 'pro', 65, 650),
  ('NZD', 'studio', 99, 1089),
  ('SGD', 'essential', 25, 250),
  ('SGD', 'pro', 49, 490),
  ('SGD', 'studio', 75, 825),
  ('AED', 'essential', 69, 690),
  ('AED', 'pro', 145, 1450),
  ('AED', 'studio', 219, 2409),
  ('SAR', 'essential', 69, 690),
  ('SAR', 'pro', 149, 1490),
  ('SAR', 'studio', 229, 2519),
  ('MXN', 'essential', 249, 2490),
  ('MXN', 'pro', 499, 4990),
  ('MXN', 'studio', 949, 10439),
  ('ZAR', 'essential', 199, 1990),
  ('ZAR', 'pro', 399, 3990),
  ('ZAR', 'studio', 749, 8239),
  ('BRL', 'essential', 59, 590),
  ('BRL', 'pro', 119, 1190),
  ('BRL', 'studio', 239, 2629),
  ('MYR', 'essential', 49, 490),
  ('MYR', 'pro', 99, 990),
  ('MYR', 'studio', 189, 2079),
  ('INR', 'essential', 699, 6990),
  ('INR', 'pro', 1499, 14990),
  ('INR', 'studio', 3299, 36289),
  ('PHP', 'essential', 599, 5990),
  ('PHP', 'pro', 1199, 11990),
  ('PHP', 'studio', 2499, 27489),
  ('IDR', 'essential', 149000, 1490000),
  ('IDR', 'pro', 299000, 2990000),
  ('IDR', 'studio', 649000, 7139000),
  ('NGN', 'essential', 9900, 99000),
  ('NGN', 'pro', 19900, 199000),
  ('NGN', 'studio', 43900, 482900)
) AS v(region, plan, monthly, annual)
JOIN "price_regions" r ON r."code" = v.region
JOIN "plans" p ON p."code" = v.plan;
-- Studio yearly: 11 months (Essential and Pro stay 10) — only if it is still the old 10-month price
UPDATE "plans" SET "price_annual" = 649 WHERE "code" = 'studio' AND "price_annual" = 590;
