-- leads.updated_at was only set when a row was created: nothing kept it current,
-- so "what changed lately" could not be asked. Every UPDATE now stamps it.
-- (Tornado's contact index syncs changed leads every 10 s from it — 2026-10-11.)
CREATE OR REPLACE FUNCTION leads_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_touch_updated_at ON "leads";
CREATE TRIGGER leads_touch_updated_at BEFORE UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION leads_touch_updated_at();
