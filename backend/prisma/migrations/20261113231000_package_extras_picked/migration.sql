-- 📦 A client who already picked a package saw its price without extra hours (2026-11-13).
-- Keep that price: extra hours are added automatically only on offers no client had chosen from
-- when this feature arrived. Runs once; offers loaded afterwards are not touched.
UPDATE "lead_packages" lp
SET "auto_extra_hours" = false
WHERE lp."auto_extra_hours" = true
  AND (
    EXISTS (SELECT 1 FROM "lead_packages" s WHERE s."lead_id" = lp."lead_id" AND s."is_selected" = true)
    OR EXISTS (SELECT 1 FROM "leads" l WHERE l."id" = lp."lead_id" AND l."package_snapshot" IS NOT NULL)
  );
