import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./auth";
import { syncColumns } from "./helpers";
import { UNITS, recipes } from "./cookbook";
import { foods } from "./foods";
import { mealTypes } from "./planning";

/**
 * Personal food diary (zadání §10.6).
 *
 * Two properties matter more than anything else here:
 *  - it is PER USER: `user_id` scopes every read, nobody sees another
 *    person's diary, not even a household admin,
 *  - nutrition is stored as a SNAPSHOT of computed numbers, not a reference
 *    to the recipe. Editing a recipe next month must not rewrite what you
 *    ate last week (zadání §5.5).
 */
export const diaryEntries = pgTable(
  "diary_entries",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    mealTypeId: uuid("meal_type_id").references(() => mealTypes.id),
    sourceKind: text("source_kind", {
      enum: ["recipe", "food", "manual"],
    }).notNull(),
    /** Where it came from — for linking only, never for recomputing values. */
    recipeId: uuid("recipe_id").references(() => recipes.id),
    foodId: uuid("food_id").references(() => foods.id),
    /** Snapshot of the name as well, so a renamed recipe keeps history intact. */
    title: text("title").notNull(),
    amount: numeric("amount", { precision: 10, scale: 3, mode: "number" }),
    /** 'porce' for recipes, otherwise one of UNITS. */
    unit: text("unit"),
    note: text("note"),
    /**
     * { energyKj, proteinG, …, incomplete: boolean, missing: string[] }
     * Missing nutrients stay absent — never zero (zadání §6.3).
     */
    nutrition: jsonb("nutrition").notNull(),
  },
  (t) => [
    index("diary_entries_user_date_idx").on(t.userId, t.date),
    index("diary_entries_household_idx").on(t.householdId),
  ],
);

/** Optional per-day targets, generic over the nutrient (odpověď č. 8). */
export const nutritionGoals = pgTable(
  "nutrition_goals",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    nutrientKey: text("nutrient_key").notNull(),
    targetPerDay: numeric("target_per_day", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
  },
  (t) => [
    uniqueIndex("nutrition_goals_user_nutrient_unique").on(
      t.userId,
      t.nutrientKey,
    ),
  ],
);

/** Re-exported so callers can validate units without reaching into cookbook. */
export const DIARY_UNITS = [...UNITS, "porce"] as const;
