-- 🎟️ every vendor gets a referral code; referrals record when each side got its free month (Raj, 2026-11-07)
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "referral_code" VARCHAR(24);
UPDATE "vendors"
   SET "referral_code" = COALESCE(NULLIF(UPPER(LEFT(REGEXP_REPLACE(COALESCE("business_name", ''), '[^a-zA-Z0-9]', '', 'g'), 10)), ''), 'IWOPO')
                         || '-' || UPPER(SUBSTR(MD5("id"::text || COALESCE("slug", '') || 'iwopo-ref'), 1, 4))
 WHERE "referral_code" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "vendors_referral_code_key" ON "vendors" ("referral_code");
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "friend_rewarded_at" TIMESTAMP(6);
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referrer_rewarded_at" TIMESTAMP(6);
