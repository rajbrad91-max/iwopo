-- 🕐 Timestamps "with time zone", column by column (audit 2026-11-14). Every value was written in UTC (the app sends UTC,
-- and the database's own clock is UTC), so each is read AT TIME ZONE 'UTC': the moment it records stays exactly the
-- same — checked column by column before and after. One type everywhere means a future server or session in another
-- time zone can never shift a date.
ALTER TABLE "agent_briefing"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_contacts"
  ALTER COLUMN "last_seen" TYPE timestamptz(6) USING "last_seen" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_conversations"
  ALTER COLUMN "started_at" TYPE timestamptz(6) USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_delivery_log"
  ALTER COLUMN "at" TYPE timestamptz(6) USING "at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_kb"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_memory"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_reminders"
  ALTER COLUMN "due_at" TYPE timestamptz(6) USING "due_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "done_at" TYPE timestamptz(6) USING "done_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_alert_at" TYPE timestamptz(6) USING "last_alert_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_rule_history"
  ALTER COLUMN "at" TYPE timestamptz(6) USING "at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_rules"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_tool_log"
  ALTER COLUMN "at" TYPE timestamptz(6) USING "at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_training_runs"
  ALTER COLUMN "at" TYPE timestamptz(6) USING "at" AT TIME ZONE 'UTC',
  ALTER COLUMN "undone_at" TYPE timestamptz(6) USING "undone_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_usage"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "agent_voice_usage"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "album_events"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "album_faces"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "albums"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "uploaded_at" TYPE timestamptz(6) USING "uploaded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "raws_removed_at" TYPE timestamptz(6) USING "raws_removed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "raws_received_at" TYPE timestamptz(6) USING "raws_received_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "downloads_complete_at" TYPE timestamptz(6) USING "downloads_complete_at" AT TIME ZONE 'UTC';
ALTER TABLE "chatbot_knowledge"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "chatbot_messages"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "chatbot_pending"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "chatbot_subscribers"
  ALTER COLUMN "subscribed_at" TYPE timestamptz(6) USING "subscribed_at" AT TIME ZONE 'UTC';
ALTER TABLE "chatbot_transcripts"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "chatbot_usage"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "client_links"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "contacts"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "contract_audit"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "contract_templates"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "contracts"
  ALTER COLUMN "signed_at" TYPE timestamptz(6) USING "signed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "viewed_at" TYPE timestamptz(6) USING "viewed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "voided_at" TYPE timestamptz(6) USING "voided_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "released_at" TYPE timestamptz(6) USING "released_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "client_copy_sent_at" TYPE timestamptz(6) USING "client_copy_sent_at" AT TIME ZONE 'UTC';
ALTER TABLE "crew_members"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "joined_at" TYPE timestamptz(6) USING "joined_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_login_at" TYPE timestamptz(6) USING "last_login_at" AT TIME ZONE 'UTC';
ALTER TABLE "device_tokens"
  ALTER COLUMN "last_used" TYPE timestamptz(6) USING "last_used" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" TYPE timestamptz(6) USING "revoked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "email_codes"
  ALTER COLUMN "expires_at" TYPE timestamptz(6) USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "used_at" TYPE timestamptz(6) USING "used_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "email_inquiries"
  ALTER COLUMN "last_at" TYPE timestamptz(6) USING "last_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "checked_at" TYPE timestamptz(6) USING "checked_at" AT TIME ZONE 'UTC';
ALTER TABLE "email_log"
  ALTER COLUMN "sent_at" TYPE timestamptz(6) USING "sent_at" AT TIME ZONE 'UTC';
ALTER TABLE "email_settings"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "email_templates"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "face_clusters"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "favorites"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "file_folders"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "file_share_items"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "file_shares"
  ALTER COLUMN "expires_at" TYPE timestamptz(6) USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "followups"
  ALTER COLUMN "last_inbound_at" TYPE timestamptz(6) USING "last_inbound_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "snooze_until" TYPE timestamptz(6) USING "snooze_until" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "help_videos"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "inquiry_settings"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "invoices"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "lead_crew"
  ALTER COLUMN "checked_in_at" TYPE timestamptz(6) USING "checked_in_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "checked_out_at" TYPE timestamptz(6) USING "checked_out_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "lead_packages"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "leads"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "archived_at" TYPE timestamptz(6) USING "archived_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "seen_at" TYPE timestamptz(6) USING "seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "packages_sent_at" TYPE timestamptz(6) USING "packages_sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "payment_claimed_at" TYPE timestamptz(6) USING "payment_claimed_at" AT TIME ZONE 'UTC';
ALTER TABLE "notifications"
  ALTER COLUMN "seen_at" TYPE timestamptz(6) USING "seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "occurred_at" TYPE timestamptz(6) USING "occurred_at" AT TIME ZONE 'UTC';
ALTER TABLE "occasion_greetings"
  ALTER COLUMN "sent_at" TYPE timestamptz(6) USING "sent_at" AT TIME ZONE 'UTC';
ALTER TABLE "offers"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "outside_messages"
  ALTER COLUMN "sent_at" TYPE timestamptz(6) USING "sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "package_templates"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "payments"
  ALTER COLUMN "paid_at" TYPE timestamptz(6) USING "paid_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "pc_devices"
  ALTER COLUMN "last_seen" TYPE timestamptz(6) USING "last_seen" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" TYPE timestamptz(6) USING "revoked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "pc_jobs"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "pending_uploads"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "photos"
  ALTER COLUMN "selected_at" TYPE timestamptz(6) USING "selected_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "plans"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "platform_settings"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_votes"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "project_stages"
  ALTER COLUMN "backed_up_at" TYPE timestamptz(6) USING "backed_up_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "sent_to_editor_at" TYPE timestamptz(6) USING "sent_to_editor_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "editing_photos_done_at" TYPE timestamptz(6) USING "editing_photos_done_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "editing_videos_done_at" TYPE timestamptz(6) USING "editing_videos_done_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "delivery_due_at" TYPE timestamptz(6) USING "delivery_due_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "delivered_at" TYPE timestamptz(6) USING "delivered_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "review_asked_at" TYPE timestamptz(6) USING "review_asked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "download_reminder_at" TYPE timestamptz(6) USING "download_reminder_at" AT TIME ZONE 'UTC';
ALTER TABLE "push_subscriptions"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "raw_editors"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "joined_at" TYPE timestamptz(6) USING "joined_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_login_at" TYPE timestamptz(6) USING "last_login_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" TYPE timestamptz(6) USING "revoked_at" AT TIME ZONE 'UTC';
ALTER TABLE "raw_files"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "delivered_at" TYPE timestamptz(6) USING "delivered_at" AT TIME ZONE 'UTC';
ALTER TABLE "rawsel_settings"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "referrals"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "rewarded_at" TYPE timestamptz(6) USING "rewarded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "friend_rewarded_at" TYPE timestamptz(6) USING "friend_rewarded_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "referrer_rewarded_at" TYPE timestamptz(6) USING "referrer_rewarded_at" AT TIME ZONE 'UTC';
ALTER TABLE "revoked_tokens"
  ALTER COLUMN "expires_at" TYPE timestamptz(6) USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" TYPE timestamptz(6) USING "revoked_at" AT TIME ZONE 'UTC';
ALTER TABLE "selection_notes"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "completed_at" TYPE timestamptz(6) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "selections"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "share_recipients"
  ALTER COLUMN "sent_at" TYPE timestamptz(6) USING "sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "opened_at" TYPE timestamptz(6) USING "opened_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "site_events"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "storage_objects"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_messages"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "trial_signups"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "users"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "tokens_valid_from" TYPE timestamptz(6) USING "tokens_valid_from" AT TIME ZONE 'UTC',
  ALTER COLUMN "email_verified_at" TYPE timestamptz(6) USING "email_verified_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "terms_accepted_at" TYPE timestamptz(6) USING "terms_accepted_at" AT TIME ZONE 'UTC';
ALTER TABLE "vendor_email_templates"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "vendor_feature_overrides"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "vendor_packages"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "vendor_settings"
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "vendor_sites"
  ALTER COLUMN "published_at" TYPE timestamptz(6) USING "published_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "vendor_subscriptions"
  ALTER COLUMN "started_at" TYPE timestamptz(6) USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "ends_at" TYPE timestamptz(6) USING "ends_at" AT TIME ZONE 'UTC';
ALTER TABLE "vendors"
  ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "marketing_opt_in_at" TYPE timestamptz(6) USING "marketing_opt_in_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "welcome_seen_at" TYPE timestamptz(6) USING "welcome_seen_at" AT TIME ZONE 'UTC';
ALTER TABLE "waitlist"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
