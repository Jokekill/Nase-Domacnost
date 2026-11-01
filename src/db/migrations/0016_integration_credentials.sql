CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"login" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"last_modified_by" uuid
);
--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credentials_unique" ON "integration_credentials" USING btree ("household_id","provider");--> statement-breakpoint
-- Technical table: deliberately NO log_change trigger (not synced to phones)
-- and NO set_updated_at beyond what the service writes itself.
CREATE TRIGGER integration_credentials_set_updated_at
  BEFORE UPDATE ON "integration_credentials"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
