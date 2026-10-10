-- CreateTable
CREATE TABLE "raw_files" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "album_id" INTEGER NOT NULL,
    "photo_id" INTEGER,
    "filename" VARCHAR(200) NOT NULL,
    "stem" VARCHAR(200) NOT NULL,
    "object_key" VARCHAR(400) NOT NULL,
    "size_bytes" BIGINT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(6),
    "delete_after" TIMESTAMP(6),

    CONSTRAINT "raw_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_raw_files_vendor" ON "raw_files"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_raw_files_photo" ON "raw_files"("photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_files_album_stem" ON "raw_files"("album_id", "stem");

-- AddForeignKey
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "raw_files" ADD CONSTRAINT "raw_files_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- 🎞️ Raw Selector: a PRIVATE feature (never in the catalogue, plans or SEO
-- pages), off for every vendor until Super Admin switches it on per vendor.
INSERT INTO "services" ("name", "icon", "price", "feature_key", "is_live", "is_private", "description")
VALUES ('Raw Selector', '🎞️', 0, 'rawsel', true, true, 'Private: camera RAW files for the photo editor')
ON CONFLICT ("feature_key") DO NOTHING;
