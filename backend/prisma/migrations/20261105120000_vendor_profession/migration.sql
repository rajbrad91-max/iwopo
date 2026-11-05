-- 🧑‍💼 The vendor's trade (2026-11-05): chosen when they join, changed when they load a preset in the inquiry form
-- and save it. Contract setup shows the sample contract for it. Until now the trade was read off the inquiry form's
-- background watermark, which a vendor can change on its own; existing vendors start from that.
ALTER TABLE "vendors" ADD COLUMN "profession" VARCHAR(40);
UPDATE "vendors" v SET "profession" = s."background"
  FROM "inquiry_settings" s
  WHERE s."vendor_id" = v."id" AND s."background" IS NOT NULL AND s."background" NOT IN ('', 'none');
