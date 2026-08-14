import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

/**
 * Every table that belongs to a full export, in FK-safe insert order
 * (docs/EXPORT-FORMAT.md). The order is what makes a restore work: a child
 * row can only be inserted once its parent exists.
 *
 * Deliberately NOT exported (technical, per-installation state):
 *   sessions, password_reset_tokens, household_invites — credentials/tokens,
 *   change_log, off_cache — caches and sync cursors, meaningless elsewhere,
 *   backup_runs — history of this machine's backups.
 */
export const EXPORT_TABLES = [
  ["users", schema.users],
  ["households", schema.households],
  ["household_members", schema.householdMembers],

  ["store_sections", schema.storeSections],
  ["food_categories", schema.foodCategories],
  ["food_category_closure", schema.foodCategoryClosure],
  ["foods", schema.foods],
  ["food_units", schema.foodUnits],

  ["categories", schema.categories],
  ["category_closure", schema.categoryClosure],
  ["tags", schema.tags],

  ["recipes", schema.recipes],
  ["recipe_photos", schema.recipePhotos],
  ["recipe_ingredient_groups", schema.recipeIngredientGroups],
  ["recipe_ingredients", schema.recipeIngredients],
  ["recipe_steps", schema.recipeSteps],
  ["recipe_step_ingredients", schema.recipeStepIngredients],
  ["recipe_categories", schema.recipeCategories],
  ["recipe_tags", schema.recipeTags],
  ["recipe_prep_ahead", schema.recipePrepAhead],
  ["recipe_shares", schema.recipeShares],
  ["recipe_public_links", schema.recipePublicLinks],

  ["meal_types", schema.mealTypes],
  ["meal_plan_entries", schema.mealPlanEntries],
  ["calendar_events", schema.calendarEvents],
  ["calendar_event_overrides", schema.calendarEventOverrides],

  ["task_lists", schema.taskLists],
  ["template_groups", schema.templateGroups],
  ["task_templates", schema.taskTemplates],
  ["tasks", schema.tasks],
  ["task_assignees", schema.taskAssignees],
  ["task_completion_history", schema.taskCompletionHistory],
  ["prep_task_suggestions", schema.prepTaskSuggestions],

  ["shopping_lists", schema.shoppingLists],
  ["shopping_items", schema.shoppingItems],
  ["shopping_item_sources", schema.shoppingItemSources],

  ["diary_entries", schema.diaryEntries],
  ["nutrition_goals", schema.nutritionGoals],
] as const satisfies readonly (readonly [string, PgTable])[];

export type ExportTableName = (typeof EXPORT_TABLES)[number][0];

/**
 * References that must resolve for an import to be safe: table → column →
 * table it points at. Checked against the file itself plus what is already in
 * the database (docs/ARCHITECTURE.md §4.3).
 */
export const REFERENCES: Record<string, Record<string, ExportTableName>> = {
  household_members: { userId: "users", householdId: "households" },
  food_categories: { storeSectionId: "store_sections", parentId: "food_categories" },
  food_category_closure: {
    ancestorId: "food_categories",
    descendantId: "food_categories",
  },
  foods: { foodCategoryId: "food_categories" },
  food_units: { foodId: "foods" },
  categories: { parentId: "categories" },
  category_closure: { ancestorId: "categories", descendantId: "categories" },
  recipes: { ownerId: "users", copiedFromRecipeId: "recipes" },
  recipe_photos: { recipeId: "recipes" },
  recipe_ingredient_groups: { recipeId: "recipes" },
  recipe_ingredients: {
    recipeId: "recipes",
    groupId: "recipe_ingredient_groups",
    foodId: "foods",
  },
  recipe_steps: { recipeId: "recipes", photoId: "recipe_photos" },
  recipe_step_ingredients: {
    stepId: "recipe_steps",
    ingredientId: "recipe_ingredients",
  },
  recipe_categories: { recipeId: "recipes", categoryId: "categories" },
  recipe_tags: { recipeId: "recipes", tagId: "tags" },
  recipe_prep_ahead: { recipeId: "recipes" },
  recipe_shares: { recipeId: "recipes", userId: "users" },
  recipe_public_links: { recipeId: "recipes" },
  meal_plan_entries: {
    recipeId: "recipes",
    mealTypeId: "meal_types",
    preparedBy: "users",
  },
  calendar_event_overrides: { eventId: "calendar_events" },
  task_templates: { groupId: "template_groups", taskListId: "task_lists" },
  tasks: { taskListId: "task_lists", templateId: "task_templates" },
  task_assignees: { taskId: "tasks", userId: "users" },
  task_completion_history: {
    templateId: "task_templates",
    taskId: "tasks",
    completedBy: "users",
  },
  prep_task_suggestions: {
    mealPlanEntryId: "meal_plan_entries",
    recipeId: "recipes",
    taskId: "tasks",
  },
  shopping_items: { shoppingListId: "shopping_lists", foodId: "foods" },
  shopping_item_sources: {
    shoppingItemId: "shopping_items",
    recipeId: "recipes",
    mealPlanEntryId: "meal_plan_entries",
  },
  diary_entries: { userId: "users", recipeId: "recipes", foodId: "foods" },
  nutrition_goals: { userId: "users" },
};
