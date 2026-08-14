CREATE TABLE "recipe_public_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "recipe_public_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "recipe_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" text DEFAULT 'view' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_public_links" ADD CONSTRAINT "recipe_public_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_public_links" ADD CONSTRAINT "recipe_public_links_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_shares" ADD CONSTRAINT "recipe_shares_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_shares" ADD CONSTRAINT "recipe_shares_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_shares" ADD CONSTRAINT "recipe_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_public_links_recipe_idx" ON "recipe_public_links" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_shares_recipe_idx" ON "recipe_shares" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_shares_user_idx" ON "recipe_shares" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_copied_from_recipe_id_recipes_id_fk" FOREIGN KEY ("copied_from_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;