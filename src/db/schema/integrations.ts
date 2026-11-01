import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./auth";

/**
 * Credentials for outside services the household connects to — today only
 * rohlik.cz (D-030).
 *
 * Technical table: no soft delete, not synced to phones, not in the export.
 * Disconnecting really deletes the row, because a credential that is only
 * marked deleted is still a credential sitting in the backup.
 *
 * `secretCiphertext` is AES-256-GCM (src/lib/crypto/secret-box.ts) and never
 * leaves the server — no endpoint returns it, not even to an admin.
 */
export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    /** "rohlik" — one row per household and provider. */
    provider: text("provider").notNull(),
    /** The e-mail, kept readable so Nastavení can show who is connected. */
    login: text("login").notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Last time signing in actually worked. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    /** What went wrong the last time it did not, verbatim from the service. */
    lastError: text("last_error"),
    lastModifiedBy: uuid("last_modified_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("integration_credentials_unique").on(t.householdId, t.provider),
  ],
);
