-- updated_at + change_log triggers for the diary tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['diary_entries', 'nutrition_goals'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_log_change AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION log_change(%L)', t, t, 'household_id');
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE nutrition_goals ADD CONSTRAINT nutrition_goals_target_positive
  CHECK (target_per_day > 0);
