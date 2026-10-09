-- AlterTable
ALTER TABLE "face_clusters" ADD COLUMN     "event_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_fc_album_event" ON "face_clusters"("album_id", "event_id");

