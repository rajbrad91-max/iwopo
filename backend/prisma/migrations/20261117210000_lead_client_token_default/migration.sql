-- 🔗 Every lead gets its client link at creation, whatever creates it (Raj, 2026-11-17). Leads made from a call or
-- by Tornado had none, so their packages link read /portal/null. 64 random hex characters, like the token
-- routes/leads.js makes; the leads already missing one get one now.
ALTER TABLE "leads" ALTER COLUMN "client_token" SET DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
UPDATE "leads" SET "client_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "client_token" IS NULL;
