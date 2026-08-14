CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type_id" uuid,
	"source_kind" text NOT NULL,
	"recipe_id" uuid,
	"food_id" uuid,
	"title" text NOT NULL,
	"amount" numeric(10, 3),
	"unit" text,
	"note" text,
	"nutrition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"nutrient_key" text NOT NULL,
	"target_per_day" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_meal_type_id_meal_types_id_fk" FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_goals" ADD CONSTRAINT "nutrition_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_goals" ADD CONSTRAINT "nutrition_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_entries_user_date_idx" ON "diary_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "diary_entries_household_idx" ON "diary_entries" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_goals_user_nutrient_unique" ON "nutrition_goals" USING btree ("user_id","nutrient_key");