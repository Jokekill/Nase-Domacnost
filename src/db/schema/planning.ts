import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./auth";
import { syncColumns } from "./helpers";
import { recipePrepAhead, recipes } from "./cookbook";

/* ------------------------------------------------------------------ */
/* Meal plan                                                          */
/* ------------------------------------------------------------------ */

export const mealTypes = pgTable(
  "meal_types",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("meal_types_household_idx").on(t.householdId)],
);

export const mealPlanEntries = pgTable(
  "meal_plan_entries",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    date: date("date").notNull(),
    mealTypeId: uuid("meal_type_id")
      .notNull()
      .references(() => mealTypes.id),
    // Several dishes may share one slot (soup + main course).
    sortOrder: integer("sort_order").notNull().default(0),
    recipeId: uuid("recipe_id").references(() => recipes.id),
    freeText: text("free_text"),
    servings: numeric("servings", { precision: 5, scale: 2, mode: "number" }),
    preparedBy: uuid("prepared_by").references(() => users.id),
  },
  (t) => [
    index("meal_plan_entries_household_date_idx").on(t.householdId, t.date),
  ],
);

/* ------------------------------------------------------------------ */
/* Tasks — full module lands in Phase 6; the tables exist now because  */
/* accepted prep-ahead suggestions create real tasks (see D-018).      */
/* ------------------------------------------------------------------ */

export const taskLists = pgTable(
  "task_lists",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("task_lists_household_idx").on(t.householdId)],
);

/** Groups of templates: "Denní úklid", "Týdenní úklid", "Velký úklid", … */
export const templateGroups = pgTable(
  "template_groups",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    taskListId: uuid("task_list_id").references(() => taskLists.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("template_groups_household_idx").on(t.householdId)],
);

export const taskTemplates = pgTable(
  "task_templates",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    taskListId: uuid("task_list_id").references(() => taskLists.id),
    templateGroupId: uuid("template_group_id").references(
      () => templateGroups.id,
    ),
    name: text("name").notNull(),
    description: text("description"),
    /** NULL = one-off template; otherwise any interval in days. */
    intervalDays: integer("interval_days"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("task_templates_household_idx").on(t.householdId),
    index("task_templates_group_idx").on(t.templateGroupId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    taskListId: uuid("task_list_id").references(() => taskLists.id),
    // A task created from a template is an independent copy — later template
    // edits never change it (zadání §5.5, neměnnost historie).
    templateId: uuid("template_id").references(() => taskTemplates.id),
    name: text("name").notNull(),
    description: text("description"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status", { enum: ["open", "done"] })
      .notNull()
      .default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),
  },
  (t) => [
    index("tasks_household_period_idx").on(
      t.householdId,
      t.periodStart,
      t.periodEnd,
    ),
    index("tasks_status_idx").on(t.status),
  ],
);

/**
 * Append-only record of when a template task was actually done. Drives the
 * "je čas znovu vyčistit troubu" suggestions (zadání §10.5).
 */
export const taskCompletionHistory = pgTable(
  "task_completion_history",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => taskTemplates.id),
    taskId: uuid("task_id").references(() => tasks.id),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedBy: uuid("completed_by").references(() => users.id),
  },
  (t) => [
    index("task_completion_history_template_idx").on(
      t.templateId,
      t.completedAt,
    ),
  ],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

/* ------------------------------------------------------------------ */
/* Prep-ahead suggestions (zadání §10.2) — proposals, never automatic  */
/* ------------------------------------------------------------------ */

export const prepTaskSuggestions = pgTable(
  "prep_task_suggestions",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    mealPlanEntryId: uuid("meal_plan_entry_id")
      .notNull()
      .references(() => mealPlanEntries.id, { onDelete: "cascade" }),
    recipePrepAheadId: uuid("recipe_prep_ahead_id")
      .notNull()
      .references(() => recipePrepAhead.id),
    status: text("status", { enum: ["suggested", "accepted", "dismissed"] })
      .notNull()
      .default("suggested"),
    // Set when accepted; a dismissed suggestion is never offered again.
    taskId: uuid("task_id").references(() => tasks.id),
    suggestedFor: date("suggested_for").notNull(),
  },
  (t) => [
    uniqueIndex("prep_task_suggestions_unique").on(
      t.mealPlanEntryId,
      t.recipePrepAheadId,
    ),
    index("prep_task_suggestions_household_idx").on(t.householdId),
  ],
);

/* ------------------------------------------------------------------ */
/* Calendar                                                           */
/* ------------------------------------------------------------------ */

export const calendarEvents = pgTable(
  "calendar_events",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    // Subset of RFC 5545: FREQ, INTERVAL, BYDAY, UNTIL, COUNT. NULL = one-off.
    rrule: text("rrule"),
  },
  (t) => [index("calendar_events_household_starts_idx").on(t.householdId, t.startsAt)],
);

export const calendarEventOverrides = pgTable(
  "calendar_event_overrides",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date").notNull(),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    override: jsonb("override"),
  },
  (t) => [
    uniqueIndex("calendar_event_overrides_unique").on(
      t.eventId,
      t.occurrenceDate,
    ),
  ],
);
