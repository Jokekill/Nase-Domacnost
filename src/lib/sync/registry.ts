import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

/**
 * What the sync protocol knows about (docs/SYNC.md §6).
 *
 * `pull` — mirrored to the client. `push` — the client may also write it
 * offline. The push list is deliberately the short one: the offline scenarios
 * from the assignment (§7.2) are shopping ticks, task completion and diary
 * entries. Everything else stays read-only offline, which keeps the surface
 * that has to defend itself against a hostile payload small.
 */
export type SyncEntity = {
  table: PgTable;
  /** Rows are scoped to the user, not just the household (personal diary). */
  perUser?: boolean;
  /** Client may push changes for this entity. */
  writable?: boolean;
  /** Fields a client is allowed to write. Nothing else is ever accepted. */
  writableFields?: readonly string[];
};

export const SYNC_ENTITIES: Record<string, SyncEntity> = {
  recipes: { table: schema.recipes },
  recipe_photos: { table: schema.recipePhotos },
  recipe_ingredient_groups: { table: schema.recipeIngredientGroups },
  recipe_ingredients: { table: schema.recipeIngredients },
  recipe_steps: { table: schema.recipeSteps },
  recipe_prep_ahead: { table: schema.recipePrepAhead },
  categories: { table: schema.categories },
  tags: { table: schema.tags },
  foods: { table: schema.foods },
  food_units: { table: schema.foodUnits },
  food_categories: { table: schema.foodCategories },
  store_sections: { table: schema.storeSections },
  meal_types: { table: schema.mealTypes },
  meal_plan_entries: { table: schema.mealPlanEntries },
  task_lists: { table: schema.taskLists },

  shopping_lists: { table: schema.shoppingLists },
  shopping_items: {
    table: schema.shoppingItems,
    writable: true,
    writableFields: [
      "isChecked",
      "checkedBy",
      "checkedAt",
      "amount",
      "unit",
      "note",
      "deletedAt",
    ],
  },
  tasks: {
    table: schema.tasks,
    writable: true,
    writableFields: ["status", "completedAt", "completedBy", "note", "deletedAt"],
  },
  diary_entries: {
    table: schema.diaryEntries,
    perUser: true,
    writable: true,
    writableFields: ["note", "amount", "mealTypeId", "deletedAt"],
  },
  nutrition_goals: { table: schema.nutritionGoals, perUser: true },
};

export type SyncEntityName = keyof typeof SYNC_ENTITIES;

export function isSyncEntity(name: string): name is SyncEntityName {
  return Object.hasOwn(SYNC_ENTITIES, name);
}
