import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { syncColumns } from "./helpers";
import { households, users } from "./auth";
import { foods } from "./foods";

export const UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "ks",
  "lzicka",
  "lzice",
  "spetka",
  "dle_chuti",
] as const;
export type Unit = (typeof UNITS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const VISIBILITIES = ["private", "household", "shared"] as const;

export const recipes = pgTable(
  "recipes",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    intro: text("intro"),
    baseServings: integer("base_servings").notNull().default(4),
    prepTimeMin: integer("prep_time_min"),
    cookTimeMin: integer("cook_time_min"),
    totalTimeMin: integer("total_time_min").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`coalesce(prep_time_min, 0) + coalesce(cook_time_min, 0)`,
    ),
    difficulty: text("difficulty", { enum: DIFFICULTIES }),
    source: text("source"),
    notes: text("notes"),
    visibility: text("visibility", { enum: VISIBILITIES })
      .notNull()
      .default("household"),
    copiedFromRecipeId: uuid("copied_from_recipe_id"),
    searchNormalized: text("search_normalized").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`immutable_unaccent(lower(title || ' ' || coalesce(intro, '')))`,
    ),
  },
  (t) => [
    index("recipes_household_idx").on(t.householdId),
    index("recipes_owner_idx").on(t.ownerId),
  ],
);

export const recipePhotos = pgTable(
  "recipe_photos",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    storageKey: text("storage_key").notNull(),
    originalExt: text("original_ext").notNull(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    isMain: boolean("is_main").notNull().default(false),
  },
  (t) => [index("recipe_photos_recipe_idx").on(t.recipeId)],
);

export const recipeIngredientGroups = pgTable(
  "recipe_ingredient_groups",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("recipe_ingredient_groups_recipe_idx").on(t.recipeId)],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    groupId: uuid("group_id").references(() => recipeIngredientGroups.id),
    foodId: uuid("food_id").references(() => foods.id),
    freeText: text("free_text"),
    amount: numeric("amount", { precision: 10, scale: 3, mode: "number" }),
    unit: text("unit", { enum: UNITS }),
    note: text("note"),
    isOptional: boolean("is_optional").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    // Per-recipe nutrition override — never touches the foods table (§5.3).
    nutritionOverride: jsonb("nutrition_override"),
  },
  (t) => [
    index("recipe_ingredients_recipe_idx").on(t.recipeId),
    index("recipe_ingredients_food_idx").on(t.foodId),
  ],
);

export const recipeSteps = pgTable(
  "recipe_steps",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    sortOrder: integer("sort_order").notNull().default(0),
    text: text("text").notNull(),
    photoId: uuid("photo_id").references(() => recipePhotos.id),
  },
  (t) => [index("recipe_steps_recipe_idx").on(t.recipeId)],
);

// Pure M:N link — synced inside the parent step (docs/DATA-MODEL.md §1.3).
export const recipeStepIngredients = pgTable(
  "recipe_step_ingredients",
  {
    stepId: uuid("step_id")
      .notNull()
      .references(() => recipeSteps.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => recipeIngredients.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.stepId, t.ingredientId] })],
);

export const categories = pgTable(
  "categories",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    searchNormalized: text("search_normalized").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`immutable_unaccent(lower(name))`,
    ),
  },
  (t) => [
    index("categories_household_idx").on(t.householdId),
    index("categories_parent_idx").on(t.parentId),
  ],
);

export const categoryClosure = pgTable(
  "category_closure",
  {
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    descendantId: uuid("descendant_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ancestorId, t.descendantId] }),
    index("category_closure_desc_idx").on(t.descendantId),
  ],
);

export const recipeCategories = pgTable(
  "recipe_categories",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.categoryId] }),
    index("recipe_categories_category_idx").on(t.categoryId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    searchNormalized: text("search_normalized").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`immutable_unaccent(lower(name))`,
    ),
  },
  (t) => [index("tags_household_idx").on(t.householdId)],
);

export const recipeTags = pgTable(
  "recipe_tags",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.tagId] }),
    index("recipe_tags_tag_idx").on(t.tagId),
  ],
);

export const recipePrepAhead = pgTable(
  "recipe_prep_ahead",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    leadTimeHours: integer("lead_time_hours").notNull(),
    description: text("description").notNull(),
  },
  (t) => [index("recipe_prep_ahead_recipe_idx").on(t.recipeId)],
);
