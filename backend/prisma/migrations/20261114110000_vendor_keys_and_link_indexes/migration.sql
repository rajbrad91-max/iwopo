-- 🧱 The database's own wall (audit 2026-11-14). These ten tables carried a vendor_id the database knew nothing
-- about, so deleting a vendor relied on lib/deleteVendor.js removing their rows by hand. Each now has a foreign key
-- with cascade, like the other 58. Checked first on live and staging: no row pointed at a missing vendor.
ALTER TABLE "albums" ADD CONSTRAINT "albums_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "photos" ADD CONSTRAINT "photos_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "album_events" ADD CONSTRAINT "album_events_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "album_settings" ADD CONSTRAINT "album_settings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "album_faces" ADD CONSTRAINT "album_faces_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "face_clusters" ADD CONSTRAINT "face_clusters_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "gallery_theme" ADD CONSTRAINT "gallery_theme_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "lead_packages" ADD CONSTRAINT "lead_packages_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- 🔎 Link columns with no index: a delete of the row they point to, and a join through them, read the whole table.
CREATE INDEX "addon_region_prices_service_id_idx" ON "addon_region_prices"("service_id");
CREATE INDEX "album_events_album_id_idx" ON "album_events"("album_id");
CREATE INDEX "albums_source_album_id_idx" ON "albums"("source_album_id");
CREATE INDEX "crew_members_ftp_lead_id_idx" ON "crew_members"("ftp_lead_id");
CREATE INDEX "email_log_lead_id_idx" ON "email_log"("lead_id");
CREATE INDEX "favorites_photo_id_idx" ON "favorites"("photo_id");
CREATE INDEX "lead_crew_crew_member_id_idx" ON "lead_crew"("crew_member_id");
CREATE INDEX "leads_package_id_idx" ON "leads"("package_id");
CREATE INDEX "outside_messages_lead_id_idx" ON "outside_messages"("lead_id");
CREATE INDEX "pending_uploads_folder_id_idx" ON "pending_uploads"("folder_id");
CREATE INDEX "photos_event_id_idx" ON "photos"("event_id");
CREATE INDEX "plan_region_prices_plan_id_idx" ON "plan_region_prices"("plan_id");
CREATE INDEX "referrals_friend_vendor_id_idx" ON "referrals"("friend_vendor_id");
CREATE INDEX "selections_photo_id_idx" ON "selections"("photo_id");
CREATE INDEX "services_requires_service_id_idx" ON "services"("requires_service_id");
CREATE INDEX "vendor_packages_template_id_idx" ON "vendor_packages"("template_id");
CREATE INDEX "vendor_services_service_id_idx" ON "vendor_services"("service_id");
CREATE INDEX "vendor_subscriptions_plan_id_idx" ON "vendor_subscriptions"("plan_id");
