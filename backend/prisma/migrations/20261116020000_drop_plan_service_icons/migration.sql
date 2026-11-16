-- 🧹 Plans and services no longer carry an emoji icon (Raj, 2026-11-15: no emojis anywhere)
ALTER TABLE "plans" DROP COLUMN "icon";
ALTER TABLE "services" DROP COLUMN "icon";
