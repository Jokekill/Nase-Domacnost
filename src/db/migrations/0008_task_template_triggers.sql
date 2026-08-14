-- updated_at + change_log triggers for the template tables.
-- task_completion_history is append-only and therefore not synced this way.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['template_groups', 'task_templates'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_log_change AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION log_change(%L)', t, t, 'household_id');
  END LOOP;
END $$;
--> statement-breakpoint

-- A recurring template needs a positive interval; NULL means "one-off".
ALTER TABLE task_templates ADD CONSTRAINT task_templates_interval_positive
  CHECK (interval_days IS NULL OR interval_days > 0);
--> statement-breakpoint

-- A task either sits in a period or has no dates at all; end must not precede start.
ALTER TABLE tasks ADD CONSTRAINT tasks_period_order
  CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start);
