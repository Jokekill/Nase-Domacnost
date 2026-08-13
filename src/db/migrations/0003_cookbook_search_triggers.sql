-- Full-text search vector for recipes (title + intro + notes), config 'simple'
-- + unaccent via the normalized generated column (docs/DATA-MODEL.md §1.5).
ALTER TABLE recipes ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', immutable_unaccent(lower(
      title || ' ' || coalesce(intro, '') || ' ' || coalesce(notes, '')
    )))
  ) STORED;
--> statement-breakpoint
CREATE INDEX recipes_search_tsv_idx ON recipes USING gin (search_tsv);
--> statement-breakpoint
CREATE INDEX recipes_search_trgm_idx ON recipes USING gin (search_normalized gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX foods_search_trgm_idx ON foods USING gin (search_normalized gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX categories_search_trgm_idx ON categories USING gin (search_normalized gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX food_categories_search_trgm_idx ON food_categories USING gin (search_normalized gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX tags_search_trgm_idx ON tags USING gin (search_normalized gin_trgm_ops);
--> statement-breakpoint

-- Partial uniques that drizzle-kit cannot express
CREATE UNIQUE INDEX recipe_photos_main_unique
  ON recipe_photos (recipe_id) WHERE is_main AND deleted_at IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX tags_name_unique
  ON tags (household_id, lower(name)) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX food_units_food_unit_unique
  ON food_units (food_id, unit) WHERE deleted_at IS NULL;
--> statement-breakpoint

-- Integrity: an ingredient must reference a food or carry free text
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_food_or_text
  CHECK (food_id IS NOT NULL OR free_text IS NOT NULL);
--> statement-breakpoint

-- updated_at + change_log triggers for all new synced tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'store_sections', 'food_categories', 'foods', 'food_units',
    'recipes', 'recipe_photos', 'recipe_ingredient_groups',
    'recipe_ingredients', 'recipe_steps', 'categories', 'tags',
    'recipe_prep_ahead'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_log_change AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION log_change(%L)', t, t, 'household_id');
  END LOOP;
END $$;
