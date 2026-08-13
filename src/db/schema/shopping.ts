import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./auth";
import { syncColumns } from "./helpers";
import { UNITS, recipes } from "./cookbook";
import { foods, storeSections } from "./foods";
import { mealPlanEntries } from "./planning";

export const shoppingLists = pgTable(
  "shopping_lists",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    // Lists cover a period, not a single day (zadání §10.4).
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
  },
  (t) => [
    index("shopping_lists_household_period_idx").on(
      t.householdId,
      t.periodStart,
    ),
  ],
);

export const shoppingItems = pgTable(
  "shopping_items",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    shoppingListId: uuid("shopping_list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    foodId: uuid("food_id").references(() => foods.id),
    freeText: text("free_text"),
    amount: numeric("amount", { precision: 10, scale: 3, mode: "number" }),
    unit: text("unit", { enum: UNITS }),
    note: text("note"),
    // Snapshot at creation time so later category changes do not reshuffle
    // an in-progress list; still editable by hand.
    storeSectionId: uuid("store_section_id").references(() => storeSections.id),
    isChecked: boolean("is_checked").notNull().default(false),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    checkedBy: uuid("checked_by").references(() => users.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("shopping_items_list_idx").on(t.shoppingListId),
    // Shopping in the store only ever reads the open items.
    index("shopping_items_open_idx")
      .on(t.shoppingListId)
      .where(sql`is_checked = false AND deleted_at IS NULL`),
  ],
);

/** Where a merged item came from — recipe and/or meal plan day (§6.5). */
export const shoppingItemSources = pgTable(
  "shopping_item_sources",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    shoppingItemId: uuid("shopping_item_id")
      .notNull()
      .references(() => shoppingItems.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").references(() => recipes.id),
    mealPlanEntryId: uuid("meal_plan_entry_id").references(
      () => mealPlanEntries.id,
    ),
    /** Snapshot of the contribution, so the source list stays truthful. */
    amount: numeric("amount", { precision: 10, scale: 3, mode: "number" }),
    unit: text("unit", { enum: UNITS }),
    label: text("label").notNull(),
  },
  (t) => [index("shopping_item_sources_item_idx").on(t.shoppingItemId)],
);
