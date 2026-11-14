-- 📦 Packages for every kind of vendor, with extras clients can add (Raj, 2026-11-13)

-- ✨ a folder's extras, shared by its packages
ALTER TABLE "package_templates" ADD COLUMN "extras" JSONB NOT NULL DEFAULT '[]';

-- 💲 how each master package is priced, its ribbon and line, and which folder extras it offers
ALTER TABLE "vendor_packages"
  ADD COLUMN "price_mode" VARCHAR(20) NOT NULL DEFAULT 'fixed',
  ADD COLUMN "min_guests" INTEGER,
  ADD COLUMN "auto_extra_hours" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "description" VARCHAR(300),
  ADD COLUMN "badge" VARCHAR(40),
  ADD COLUMN "extras_state" JSONB NOT NULL DEFAULT '{}';

-- 📋 the copy on a lead carries all of it, plus the client's own picks
ALTER TABLE "lead_packages"
  ADD COLUMN "price_mode" VARCHAR(20) NOT NULL DEFAULT 'fixed',
  ADD COLUMN "min_guests" INTEGER,
  ADD COLUMN "included_hours" INTEGER,
  ADD COLUMN "per_hour_price" DECIMAL(10,2),
  ADD COLUMN "auto_extra_hours" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "description" VARCHAR(300),
  ADD COLUMN "badge" VARCHAR(40),
  ADD COLUMN "extras" JSONB NOT NULL DEFAULT '[]';

-- ⏱️ Copies made before today lost their hours. Give them back from the master each came from.
-- An offer a client already has (sent, booked, paid or signed) keeps the price it was given: its
-- extra hours stay switched off until the vendor turns them on for that lead.
UPDATE "lead_packages" lp
   SET "included_hours" = vp."included_hours",
       "per_hour_price" = vp."per_hour_price",
       "auto_extra_hours" = NOT EXISTS (
             SELECT 1 FROM "leads" l
              WHERE l."id" = lp."lead_id"
                AND (l."packages_sent_at" IS NOT NULL OR l."status" = 'booked' OR l."payment_claimed_at" IS NOT NULL))
         AND NOT EXISTS (SELECT 1 FROM "contracts" c WHERE c."lead_id" = lp."lead_id" AND c."signed_at" IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."lead_id" = lp."lead_id")
  FROM "vendor_packages" vp
 WHERE lp."source_package_id" = vp."id"
   AND lp."vendor_id" = vp."vendor_id";
