-- Integrity: a meal plan entry and a shopping item each need a recipe/food
-- reference or free text (docs/DATA-MODEL.md §5, §6).
ALTER TABLE meal_plan_entries ADD CONSTRAINT meal_plan_entries_recipe_or_text
  CHECK (recipe_id IS NOT NULL OR free_text IS NOT NULL);
--> statement-breakpoint
ALTER TABLE shopping_items ADD CONSTRAINT shopping_items_food_or_text
  CHECK (food_id IS NOT NULL OR free_text IS NOT NULL);
--> statement-breakpoint
ALTER TABLE shopping_lists ADD CONSTRAINT shopping_lists_period_order
  CHECK (period_end >= period_start);
--> statement-breakpoint

-- updated_at + change_log triggers for the new synced tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'meal_types', 'meal_plan_entries', 'task_lists', 'tasks',
    'prep_task_suggestions', 'calendar_events', 'calendar_event_overrides',
    'shopping_lists', 'shopping_items', 'shopping_item_sources'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_log_change AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION log_change(%L)', t, t, 'household_id');
  END LOOP;
END $$;
