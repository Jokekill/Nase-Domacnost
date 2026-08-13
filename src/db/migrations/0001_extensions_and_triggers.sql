-- Extensions (docs/DATA-MODEL.md preamble)
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--> statement-breakpoint

-- Immutable unaccent wrapper usable in generated columns (docs/DATA-MODEL.md §1.5)
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
RETURN public.unaccent('public.unaccent', $1);
--> statement-breakpoint

-- Keep updated_at fresh on every UPDATE (applies to all synced tables)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- change_log feed (docs/DATA-MODEL.md §1.2). The household_id is read from the
-- row when present; tables without their own household_id column pass a SQL
-- expression as the trigger argument (none yet in Phase 1).
CREATE OR REPLACE FUNCTION log_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_household uuid;
  v_op text;
BEGIN
  -- Resolve household_id: trigger argument names the column holding it.
  -- For the users/households tables themselves the row id is used.
  IF TG_ARGV[0] = 'self' THEN
    v_household := NEW.id;
  ELSE
    EXECUTE format('SELECT ($1).%I::uuid', TG_ARGV[0]) INTO v_household USING NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_op := 'insert';
  ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_op := 'delete';
  ELSE
    v_op := 'update';
  END IF;

  INSERT INTO change_log (table_name, row_id, household_id, op)
  VALUES (TG_TABLE_NAME, NEW.id, v_household, v_op);
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER households_set_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- users are synced per-user; household scoping for the change feed is resolved
-- at pull time via membership, the log row stores the user id itself.
CREATE TRIGGER users_log_change
  AFTER INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION log_change('self');
--> statement-breakpoint
CREATE TRIGGER households_log_change
  AFTER INSERT OR UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION log_change('self');
