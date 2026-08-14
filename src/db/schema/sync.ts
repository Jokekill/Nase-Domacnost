import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Idempotence for pushed operations (docs/SYNC.md §3). A replayed batch must
 * return the stored result instead of applying anything a second time.
 * Retention 90 days, same as change_log — cleaned by the backup sidecar.
 */
export const syncAppliedOps = pgTable(
  "sync_applied_ops",
  {
    opId: uuid("op_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    result: jsonb("result").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sync_applied_ops_applied_at_idx").on(t.appliedAt)],
);
