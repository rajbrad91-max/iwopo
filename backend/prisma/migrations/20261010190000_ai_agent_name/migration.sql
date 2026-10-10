-- 🤖 Raj, 2026-10-10: his private assistant is called "AI Agent", so it is
-- never confused with the clients' AI chatbot.
UPDATE "services" SET "name" = 'AI Agent', "description" = 'Private: an AI agent that reads and acts in the vendor panel' WHERE "feature_key" = 'agent';
