import { sql } from "drizzle-orm";
import {
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
import { syncColumns } from "./helpers";
import { households } from "./auth";

/** Store sections for shopping-list ordering (Phase 5 UI; table exists early
 *  because food_categories references it — see D-013). */
export const storeSections = pgTable("store_sections", {
  ...syncColumns,
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const foodCategories = pgTable(
  "food_categories",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    // Inherited down the tree from the nearest ancestor when NULL (Phase 5).
    storeSectionId: uuid("store_section_id").references(() => storeSections.id),
    searchNormalized: text("search_normalized").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`immutable_unaccent(lower(name))`,
    ),
  },
  (t) => [
    index("food_categories_household_idx").on(t.householdId),
    index("food_categories_parent_idx").on(t.parentId),
  ],
);

export const foodCategoryClosure = pgTable(
  "food_category_closure",
  {
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => foodCategories.id, { onDelete: "cascade" }),
    descendantId: uuid("descendant_id")
      .notNull()
      .references(() => foodCategories.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ancestorId, t.descendantId] }),
    index("food_category_closure_desc_idx").on(t.descendantId),
  ],
);

export const foods = pgTable(
  "foods",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    foodCategoryId: uuid("food_category_id").references(
      () => foodCategories.id,
    ),
    referenceUnit: text("reference_unit", {
      enum: ["100g", "100ml", "piece"],
    })
      .notNull()
      .default("100g"),
    // Nutrition per reference unit — all nullable, never default to 0 (§6.1).
    energyKj: numeric("energy_kj", { precision: 10, scale: 2, mode: "number" }),
    proteinG: numeric("protein_g", { precision: 10, scale: 2, mode: "number" }),
    carbsG: numeric("carbs_g", { precision: 10, scale: 2, mode: "number" }),
    sugarsG: numeric("sugars_g", { precision: 10, scale: 2, mode: "number" }),
    fiberG: numeric("fiber_g", { precision: 10, scale: 2, mode: "number" }),
    fatG: numeric("fat_g", { precision: 10, scale: 2, mode: "number" }),
    satFatG: numeric("sat_fat_g", { precision: 10, scale: 2, mode: "number" }),
    saltG: numeric("salt_g", { precision: 10, scale: 2, mode: "number" }),
    densityGPerMl: numeric("density_g_per_ml", {
      precision: 10,
      scale: 4,
      mode: "number",
    }),
    gramsPerPiece: numeric("grams_per_piece", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    source: text("source", { enum: ["seed", "manual", "openfoodfacts"] })
      .notNull()
      .default("manual"),
    offBarcode: text("off_barcode"),
    searchNormalized: text("search_normalized").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`immutable_unaccent(lower(name))`,
    ),
  },
  (t) => [
    index("foods_household_idx").on(t.householdId),
    index("foods_category_idx").on(t.foodCategoryId),
  ],
);

export const foodUnits = pgTable(
  "food_units",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    unit: text("unit").notNull(), // 'lzice' | 'lzicka' | 'ks' | custom label
    gramsPerUnit: numeric("grams_per_unit", {
      precision: 10,
      scale: 2,
      mode: "number",
    }).notNull(),
  },
  (t) => [index("food_units_food_idx").on(t.foodId)],
);

// Technical cache for Open Food Facts responses (Phase 3).
export const offCache = pgTable("off_cache", {
  cacheKey: text("cache_key").primaryKey(),
  response: jsonb("response").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
