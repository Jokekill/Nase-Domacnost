CREATE TABLE "calendar_event_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"override" jsonb
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"rrule" text
);
--> statement-breakpoint
CREATE TABLE "meal_plan_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"recipe_id" uuid,
	"free_text" text,
	"servings" numeric(5, 2),
	"prepared_by" uuid
);
--> statement-breakpoint
CREATE TABLE "meal_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prep_task_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"meal_plan_entry_id" uuid NOT NULL,
	"recipe_prep_ahead_id" uuid NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"task_id" uuid,
	"suggested_for" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"task_list_id" uuid,
	"template_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"period_start" date,
	"period_end" date,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "shopping_item_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"shopping_item_id" uuid NOT NULL,
	"recipe_id" uuid,
	"meal_plan_entry_id" uuid,
	"amount" numeric(10, 3),
	"unit" text,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"shopping_list_id" uuid NOT NULL,
	"food_id" uuid,
	"free_text" text,
	"amount" numeric(10, 3),
	"unit" text,
	"note" text,
	"store_section_id" uuid,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_event_overrides" ADD CONSTRAINT "calendar_event_overrides_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_overrides" ADD CONSTRAINT "calendar_event_overrides_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_meal_type_id_meal_types_id_fk" FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_types" ADD CONSTRAINT "meal_types_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_task_suggestions" ADD CONSTRAINT "prep_task_suggestions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_task_suggestions" ADD CONSTRAINT "prep_task_suggestions_meal_plan_entry_id_meal_plan_entries_id_fk" FOREIGN KEY ("meal_plan_entry_id") REFERENCES "public"."meal_plan_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_task_suggestions" ADD CONSTRAINT "prep_task_suggestions_recipe_prep_ahead_id_recipe_prep_ahead_id_fk" FOREIGN KEY ("recipe_prep_ahead_id") REFERENCES "public"."recipe_prep_ahead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_task_suggestions" ADD CONSTRAINT "prep_task_suggestions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_task_list_id_task_lists_id_fk" FOREIGN KEY ("task_list_id") REFERENCES "public"."task_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item_sources" ADD CONSTRAINT "shopping_item_sources_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item_sources" ADD CONSTRAINT "shopping_item_sources_shopping_item_id_shopping_items_id_fk" FOREIGN KEY ("shopping_item_id") REFERENCES "public"."shopping_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item_sources" ADD CONSTRAINT "shopping_item_sources_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item_sources" ADD CONSTRAINT "shopping_item_sources_meal_plan_entry_id_meal_plan_entries_id_fk" FOREIGN KEY ("meal_plan_entry_id") REFERENCES "public"."meal_plan_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_shopping_list_id_shopping_lists_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_store_section_id_store_sections_id_fk" FOREIGN KEY ("store_section_id") REFERENCES "public"."store_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_overrides_unique" ON "calendar_event_overrides" USING btree ("event_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "calendar_events_household_starts_idx" ON "calendar_events" USING btree ("household_id","starts_at");--> statement-breakpoint
CREATE INDEX "meal_plan_entries_household_date_idx" ON "meal_plan_entries" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "meal_types_household_idx" ON "meal_types" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prep_task_suggestions_unique" ON "prep_task_suggestions" USING btree ("meal_plan_entry_id","recipe_prep_ahead_id");--> statement-breakpoint
CREATE INDEX "prep_task_suggestions_household_idx" ON "prep_task_suggestions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "task_lists_household_idx" ON "task_lists" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "tasks_household_period_idx" ON "tasks" USING btree ("household_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shopping_item_sources_item_idx" ON "shopping_item_sources" USING btree ("shopping_item_id");--> statement-breakpoint
CREATE INDEX "shopping_items_list_idx" ON "shopping_items" USING btree ("shopping_list_id");--> statement-breakpoint
CREATE INDEX "shopping_items_open_idx" ON "shopping_items" USING btree ("shopping_list_id") WHERE is_checked = false AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "shopping_lists_household_period_idx" ON "shopping_lists" USING btree ("household_id","period_start");