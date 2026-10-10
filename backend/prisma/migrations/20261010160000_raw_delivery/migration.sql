-- AlterTable
ALTER TABLE "album_events" ADD COLUMN     "delivery" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "alt_text" VARCHAR(400);

-- CreateTable
CREATE TABLE "rawsel_settings" (
    "vendor_id" INTEGER NOT NULL,
    "logo_key" VARCHAR(400),
    "logo_pos" VARCHAR(2) NOT NULL DEFAULT 'br',
    "logo_size" INTEGER NOT NULL DEFAULT 14,
    "logo_opacity" INTEGER NOT NULL DEFAULT 85,
    "logo_margin" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rawsel_settings_pkey" PRIMARY KEY ("vendor_id")
);

-- AddForeignKey
ALTER TABLE "rawsel_settings" ADD CONSTRAINT "rawsel_settings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

