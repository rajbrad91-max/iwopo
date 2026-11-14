-- 👀 the temporary tester tracking (2026-10-11, "remove after about a month") is gone with its code (audit 2026-11-14).
-- Staging's rows were saved first: /root/backups/tester_activity_2026-11-14.csv
DROP TABLE "tester_activity";
DELETE FROM "platform_settings" WHERE "key" = 'tracked_user_ids';
