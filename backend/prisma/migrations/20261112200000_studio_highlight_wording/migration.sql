-- 🎬 No other company's name in iwopo's plan list (Raj, 2026-11-12): Studio's "Video streaming, YouTube-style" is
-- reworded. Only that one line of Studio's highlights changes.
UPDATE "plans"
SET "highlights" = replace("highlights"::text, 'Video streaming, YouTube-style', 'Video streaming for your clients')::jsonb
WHERE "code" = 'studio' AND "highlights"::text LIKE '%Video streaming, YouTube-style%';
