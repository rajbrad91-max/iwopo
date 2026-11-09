-- 📊 Gallery download log (Raj, 2026-11-09): which photo, film or Zip a client downloaded from a gallery, from which
-- IP address and when. A Studio feature (gallery_insights); the rows go with their gallery.
CREATE TABLE IF NOT EXISTS "gallery_downloads" (
  "id" SERIAL NOT NULL,
  "album_id" INTEGER NOT NULL,
  "photo_id" INTEGER,
  "kind" VARCHAR(10) NOT NULL,
  "label" VARCHAR(300) NOT NULL,
  "ip" VARCHAR(64) NOT NULL,
  "device" VARCHAR(20),
  "browser" VARCHAR(20),
  "place" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gallery_downloads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gallery_downloads_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "gallery_downloads_album_id_created_at_idx" ON "gallery_downloads"("album_id", "created_at");

-- The plan feature: not sold on its own (is_live = false keeps it out of the catalogue); granted by the highest plan.
INSERT INTO "services" ("name", "icon", "price", "feature_key", "is_live", "is_private", "description")
VALUES ('Gallery download log & shortcuts', '📊', 0, 'gallery_insights', false, false, 'Who downloaded which photos and Zips from a gallery, from which IP and when — and quick buttons on each gallery')
ON CONFLICT ("feature_key") DO NOTHING;
INSERT INTO "plan_features" ("plan_id", "feature_key")
SELECT "id", 'gallery_insights' FROM "plans" ORDER BY "price_monthly" DESC, "id" DESC LIMIT 1
ON CONFLICT DO NOTHING;
