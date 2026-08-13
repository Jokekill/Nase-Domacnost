import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { syncColumns } from "./helpers";

export const users = pgTable(
  "users",
  {
    ...syncColumns,
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

// Technical table — not synced, no soft delete.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_expires_at_idx").on(t.expiresAt),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

// Technical table — not synced, no soft delete.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_tokens_token_hash_unique").on(t.tokenHash)],
);

export const households = pgTable("households", {
  ...syncColumns,
  name: text("name").notNull(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("household_members_pk").on(t.householdId, t.userId),
    // One household per user (docs/DECISIONS.md D-004)
    uniqueIndex("household_members_user_unique").on(t.userId),
  ],
);

// Technical table — not synced, no soft delete.
export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    tokenHash: text("token_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("household_invites_token_hash_unique").on(t.tokenHash)],
);

// Global sync cursor feed, filled by DB triggers (docs/DATA-MODEL.md §1.2).
export const changeLog = pgTable(
  "change_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    tableName: text("table_name").notNull(),
    rowId: uuid("row_id").notNull(),
    householdId: uuid("household_id").notNull(),
    op: text("op", { enum: ["insert", "update", "delete"] }).notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("change_log_household_seq_idx").on(t.householdId, t.seq)],
);

export const backupRuns = pgTable("backup_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["auto", "manual"] }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status", { enum: ["running", "ok", "failed"] }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  detail: text("detail"),
});
