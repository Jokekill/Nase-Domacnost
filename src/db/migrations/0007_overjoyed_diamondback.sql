CREATE TABLE "task_completion_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"task_id" uuid,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"task_list_id" uuid,
	"template_group_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"interval_days" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_modified_by" uuid,
	"field_mtimes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household_id" uuid NOT NULL,
	"task_list_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_completion_history" ADD CONSTRAINT "task_completion_history_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion_history" ADD CONSTRAINT "task_completion_history_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion_history" ADD CONSTRAINT "task_completion_history_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion_history" ADD CONSTRAINT "task_completion_history_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_task_list_id_task_lists_id_fk" FOREIGN KEY ("task_list_id") REFERENCES "public"."task_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_template_group_id_template_groups_id_fk" FOREIGN KEY ("template_group_id") REFERENCES "public"."template_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_groups" ADD CONSTRAINT "template_groups_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_groups" ADD CONSTRAINT "template_groups_task_list_id_task_lists_id_fk" FOREIGN KEY ("task_list_id") REFERENCES "public"."task_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_completion_history_template_idx" ON "task_completion_history" USING btree ("template_id","completed_at");--> statement-breakpoint
CREATE INDEX "task_templates_household_idx" ON "task_templates" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "task_templates_group_idx" ON "task_templates" USING btree ("template_group_id");--> statement-breakpoint
CREATE INDEX "template_groups_household_idx" ON "template_groups" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;