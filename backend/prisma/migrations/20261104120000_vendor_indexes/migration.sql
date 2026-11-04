-- 🐢 Every vendor-owned table can find one vendor's rows without reading everyone's (audit fix #8, 2026-11-04).
-- Also makes removing a vendor fast: each of these points at vendors(id) and the delete must find their rows.
CREATE INDEX IF NOT EXISTS "album_events_vendor_id_idx" ON "album_events"("vendor_id");
CREATE INDEX IF NOT EXISTS "chatbot_messages_vendor_id_idx" ON "chatbot_messages"("vendor_id");
CREATE INDEX IF NOT EXISTS "chatbot_pending_vendor_id_idx" ON "chatbot_pending"("vendor_id");
CREATE INDEX IF NOT EXISTS "contracts_vendor_id_idx" ON "contracts"("vendor_id");
CREATE INDEX IF NOT EXISTS "face_clusters_vendor_id_idx" ON "face_clusters"("vendor_id");
CREATE INDEX IF NOT EXISTS "support_messages_vendor_id_idx" ON "support_messages"("vendor_id");
CREATE INDEX IF NOT EXISTS "trial_signups_vendor_id_idx" ON "trial_signups"("vendor_id");
CREATE INDEX IF NOT EXISTS "share_recipients_vendor_id_idx" ON "share_recipients"("vendor_id");
CREATE INDEX IF NOT EXISTS "pc_devices_vendor_id_idx" ON "pc_devices"("vendor_id");
CREATE INDEX IF NOT EXISTS "pc_jobs_vendor_id_idx" ON "pc_jobs"("vendor_id");
CREATE INDEX IF NOT EXISTS "security_events_vendor_id_idx" ON "security_events"("vendor_id");
