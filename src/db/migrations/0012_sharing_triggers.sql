-- updated_at + change_log triggers for the sharing tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipe_shares', 'recipe_public_links'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_log_change AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION log_change(%L)', t, t, 'household_id');
  END LOOP;
END $$;
--> statement-breakpoint

-- One live share per (recipe, user); a revoked (soft-deleted) share does not
-- block sharing the recipe with the same person again.
CREATE UNIQUE INDEX recipe_shares_recipe_user_unique
  ON recipe_shares (recipe_id, user_id) WHERE deleted_at IS NULL;
--> statement-breakpoint

ALTER TABLE recipe_shares ADD CONSTRAINT recipe_shares_permission_check
  CHECK (permission IN ('view', 'edit'));
--> statement-breakpoint

-- A recipe cannot be its own source.
ALTER TABLE recipes ADD CONSTRAINT recipes_copied_from_not_self
  CHECK (copied_from_recipe_id IS NULL OR copied_from_recipe_id <> id);
