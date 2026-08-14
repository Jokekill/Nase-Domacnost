CREATE TABLE "sync_applied_ops" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_applied_ops_applied_at_idx" ON "sync_applied_ops" USING btree ("applied_at");