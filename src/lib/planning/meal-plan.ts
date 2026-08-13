import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import {
  mealPlanEntries,
  mealTypes,
  prepTaskSuggestions,
  recipePrepAhead,
  recipes,
  users,
} from "@/db/schema";

type Actor = { userId: string; householdId: string };

export async function listMealPlan(
  householdId: string,
  from: string,
  to: string,
) {
  return db
    .select({
      id: mealPlanEntries.id,
      date: mealPlanEntries.date,
      mealTypeId: mealPlanEntries.mealTypeId,
      mealTypeName: mealTypes.name,
      mealTypeOrder: mealTypes.sortOrder,
      sortOrder: mealPlanEntries.sortOrder,
      recipeId: mealPlanEntries.recipeId,
      recipeTitle: recipes.title,
      recipeBaseServings: recipes.baseServings,
      freeText: mealPlanEntries.freeText,
      servings: mealPlanEntries.servings,
      preparedBy: mealPlanEntries.preparedBy,
      preparedByName: users.displayName,
      photoKey: sql<string | null>`(
        SELECT rp.storage_key FROM recipe_photos rp
        WHERE rp.recipe_id = "meal_plan_entries"."recipe_id"
          AND rp.deleted_at IS NULL
        ORDER BY rp.is_main DESC, rp.sort_order ASC LIMIT 1
      )`.as("photo_key"),
    })
    .from(mealPlanEntries)
    .innerJoin(mealTypes, eq(mealTypes.id, mealPlanEntries.mealTypeId))
    .leftJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
    .leftJoin(users, eq(users.id, mealPlanEntries.preparedBy))
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        isNull(mealPlanEntries.deletedAt),
        gte(mealPlanEntries.date, from),
        lte(mealPlanEntries.date, to),
      ),
    )
    .orderBy(
      asc(mealPlanEntries.date),
      asc(mealTypes.sortOrder),
      asc(mealPlanEntries.sortOrder),
    );
}

/**
 * Creates prep-ahead suggestions for a meal plan entry whose recipe declares
 * `recipe_prep_ahead`. Suggestions are proposals only — nothing is scheduled
 * automatically, and a dismissed suggestion never comes back (zadání §10.2).
 */
export async function refreshPrepSuggestions(
  actor: Actor,
  entryId: string,
): Promise<void> {
  const [entry] = await db
    .select({
      id: mealPlanEntries.id,
      date: mealPlanEntries.date,
      recipeId: mealPlanEntries.recipeId,
    })
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.id, entryId))
    .limit(1);
  if (!entry?.recipeId) return;

  const prepRows = await db
    .select()
    .from(recipePrepAhead)
    .where(
      and(
        eq(recipePrepAhead.recipeId, entry.recipeId),
        isNull(recipePrepAhead.deletedAt),
      ),
    );

  for (const prep of prepRows) {
    const mealDate = new Date(`${entry.date}T12:00:00`);
    const suggestedFor = new Date(
      mealDate.getTime() - prep.leadTimeHours * 3600_000,
    );
    const suggestedForDate = suggestedFor.toISOString().slice(0, 10);

    await db
      .insert(prepTaskSuggestions)
      .values({
        id: uuidv7(),
        householdId: actor.householdId,
        mealPlanEntryId: entry.id,
        recipePrepAheadId: prep.id,
        status: "suggested",
        suggestedFor: suggestedForDate,
        lastModifiedBy: actor.userId,
      })
      // Never resurrect a dismissed suggestion; only refresh the date of one
      // still waiting for a decision.
      .onConflictDoUpdate({
        target: [
          prepTaskSuggestions.mealPlanEntryId,
          prepTaskSuggestions.recipePrepAheadId,
        ],
        set: { suggestedFor: suggestedForDate },
        setWhere: eq(prepTaskSuggestions.status, "suggested"),
      });
  }
}

export async function listPrepSuggestions(
  householdId: string,
  from: string,
  to: string,
) {
  return db
    .select({
      id: prepTaskSuggestions.id,
      status: prepTaskSuggestions.status,
      suggestedFor: prepTaskSuggestions.suggestedFor,
      taskId: prepTaskSuggestions.taskId,
      description: recipePrepAhead.description,
      leadTimeHours: recipePrepAhead.leadTimeHours,
      mealDate: mealPlanEntries.date,
      recipeTitle: recipes.title,
      recipeId: recipes.id,
    })
    .from(prepTaskSuggestions)
    .innerJoin(
      recipePrepAhead,
      eq(recipePrepAhead.id, prepTaskSuggestions.recipePrepAheadId),
    )
    .innerJoin(
      mealPlanEntries,
      eq(mealPlanEntries.id, prepTaskSuggestions.mealPlanEntryId),
    )
    .leftJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
    .where(
      and(
        eq(prepTaskSuggestions.householdId, householdId),
        isNull(prepTaskSuggestions.deletedAt),
        isNull(mealPlanEntries.deletedAt),
        gte(prepTaskSuggestions.suggestedFor, from),
        lte(prepTaskSuggestions.suggestedFor, to),
      ),
    )
    .orderBy(asc(prepTaskSuggestions.suggestedFor));
}
