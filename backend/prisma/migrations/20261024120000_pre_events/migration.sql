-- 🗓️ a lead's pre-events (Mehndi, Jaggo, Reception…), printed in the contract's schedule
ALTER TABLE "leads" ADD COLUMN "pre_events" JSONB NOT NULL DEFAULT '[]';
