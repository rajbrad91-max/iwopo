-- 🔔 Bell notices that can lead somewhere now do (Raj, 2026-11-15). Data only — no schema change.
-- A notice about something that no longer exists (a deleted lead) keeps no link and stays plain text.

-- 📧 an email-inquiry notice opens its thread: this vendor's inquiry with that subject, nearest in time
UPDATE "notifications" n
   SET "link_type" = 'email',
       "link_id" = (SELECT e."id" FROM "email_inquiries" e
                     WHERE e."vendor_id" = n."vendor_id" AND e."is_inquiry" AND e."subject" = n."body"
                     ORDER BY abs(extract(epoch FROM e."last_at" - coalesce(n."occurred_at", n."created_at"))) LIMIT 1)
 WHERE n."type" = 'email_inquiry' AND n."link_type" IS NULL
   AND EXISTS (SELECT 1 FROM "email_inquiries" e WHERE e."vendor_id" = n."vendor_id" AND e."is_inquiry" AND e."subject" = n."body");

-- 💾 storage and 💤 inactive-plan notices were saved as a 'tab' link the bell could not follow
UPDATE "notifications" SET "link_type" = CASE WHEN "type" = 'billing' AND "title" ~ '(storage|files are locked|galleries and files)' THEN 'services' ELSE 'plans' END,
       "link_id" = NULL
 WHERE "link_type" = 'tab';

-- ⏰ a reminder opens the reminders; 📸 photos uploaded opens Raw Selector; 🎞️ edited photos delivered opens Galleries
UPDATE "notifications" SET "link_type" = 'agent' WHERE "type" = 'reminder' AND "link_type" IS NULL;
UPDATE "notifications" SET "link_type" = 'rawsel' WHERE "link_type" IS NULL AND "title" LIKE '📸 %photos uploaded';
UPDATE "notifications" SET "link_type" = 'galleries' WHERE "link_type" IS NULL AND "title" LIKE '🎞️ %delivered';
