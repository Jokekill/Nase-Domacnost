import { sql } from "drizzle-orm";
import { jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Sync-ready columns shared by every synchronizable domain table
 * (see docs/DATA-MODEL.md §1.1). `id` is a client-generated UUIDv7.
 */
export const syncColumns = {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // FK to users added per-table to avoid circular imports; kept nullable so
  // system operations (seed, import) can write without a user context.
  lastModifiedBy: uuid("last_modified_by"),
  // field -> last-modified timestamp, maintained by the write helper
  // (docs/SYNC.md §4.1, D-008)
  fieldMtimes: jsonb("field_mtimes").notNull().default(sql`'{}'::jsonb`),
};
