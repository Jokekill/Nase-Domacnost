import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import {
  foodUnits,
  foods,
  mealPlanEntries,
  recipeIngredients,
  recipes,
  shoppingItemSources,
  shoppingItems,
  shoppingLists,
  storeSections,
  users,
} from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import {
  mergeShoppingItems,
  type MergeInput,
} from "@/lib/domain/shopping-merge";
import { scaleIngredient } from "@/lib/domain/servings";

type Actor = { userId: string; householdId: string };

/** Placeholder label for quantities that were added by hand, not imported. */
const MANUAL_SOURCE = "__manual__";

export async function listShoppingLists(householdId: string) {
  return db
    .select({
      id: shoppingLists.id,
      name: shoppingLists.name,
      periodStart: shoppingLists.periodStart,
      periodEnd: shoppingLists.periodEnd,
      total: sql<number>`(
        SELECT count(*)::int FROM shopping_items si
        WHERE si.shopping_list_id = "shopping_lists"."id"
          AND si.deleted_at IS NULL
      )`.as("total"),
      checked: sql<number>`(
        SELECT count(*)::int FROM shopping_items si
        WHERE si.shopping_list_id = "shopping_lists"."id"
          AND si.deleted_at IS NULL AND si.is_checked
      )`.as("checked"),
    })
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.householdId, householdId),
        isNull(shoppingLists.deletedAt),
      ),
    )
    .orderBy(sql`"shopping_lists"."period_start" DESC`);
}

export async function getShoppingList(householdId: string, listId: string) {
  const [list] = await db
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.id, listId),
        eq(shoppingLists.householdId, householdId),
        isNull(shoppingLists.deletedAt),
      ),
    )
    .limit(1);
  if (!list) throw new ApiError("not_found", "Nákupní seznam nenalezen.");

  const items = await db
    .select({
      id: shoppingItems.id,
      foodId: shoppingItems.foodId,
      foodName: foods.name,
      freeText: shoppingItems.freeText,
      amount: shoppingItems.amount,
      unit: shoppingItems.unit,
      note: shoppingItems.note,
      storeSectionId: shoppingItems.storeSectionId,
      storeSectionName: storeSections.name,
      storeSectionOrder: storeSections.sortOrder,
      isChecked: shoppingItems.isChecked,
      checkedBy: shoppingItems.checkedBy,
      checkedByName: users.displayName,
      sortOrder: shoppingItems.sortOrder,
    })
    .from(shoppingItems)
    .leftJoin(foods, eq(foods.id, shoppingItems.foodId))
    .leftJoin(storeSections, eq(storeSections.id, shoppingItems.storeSectionId))
    .leftJoin(users, eq(users.id, shoppingItems.checkedBy))
    .where(
      and(
        eq(shoppingItems.shoppingListId, listId),
        isNull(shoppingItems.deletedAt),
      ),
    )
    .orderBy(
      sql`${storeSections.sortOrder} ASC NULLS LAST`,
      asc(shoppingItems.sortOrder),
    );

  const sources = items.length
    ? await db
        .select()
        .from(shoppingItemSources)
        .where(
          and(
            inArray(
              shoppingItemSources.shoppingItemId,
              items.map((i) => i.id),
            ),
            isNull(shoppingItemSources.deletedAt),
          ),
        )
    : [];

  return {
    ...list,
    items: items.map((item) => ({
      ...item,
      name: item.foodName ?? item.freeText ?? "",
      sources: sources
        .filter((s) => s.shoppingItemId === item.id)
        .map((s) => ({
          label: s.label,
          amount: s.amount,
          unit: s.unit,
          recipeId: s.recipeId,
        })),
    })),
  };
}

export async function createShoppingList(
  actor: Actor,
  input: { id: string; name: string; periodStart: string; periodEnd: string },
) {
  await db
    .insert(shoppingLists)
    .values({
      id: input.id,
      householdId: actor.householdId,
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lastModifiedBy: actor.userId,
    })
    .onConflictDoNothing();
}

/** Nearest store section walking up the food category tree. */
async function resolveStoreSections(
  householdId: string,
  foodIds: string[],
): Promise<Map<string, string>> {
  if (foodIds.length === 0) return new Map();
  const rows = await db.execute<{ food_id: string; store_section_id: string }>(sql`
    SELECT f.id AS food_id, (
      SELECT fc2.store_section_id
      FROM food_category_closure cc
      JOIN food_categories fc2 ON fc2.id = cc.ancestor_id
      WHERE cc.descendant_id = f.food_category_id
        AND fc2.store_section_id IS NOT NULL
      ORDER BY cc.depth ASC
      LIMIT 1
    ) AS store_section_id
    FROM foods f
    WHERE f.id IN ${foodIds} AND f.household_id = ${householdId}
  `);
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.store_section_id) map.set(row.food_id, row.store_section_id);
  }
  return map;
}

type IngredientRow = {
  foodId: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  isOptional: boolean;
  isSpice: boolean;
  divisiblePieces: boolean;
  food: {
    densityGPerMl: number | null;
    gramsPerPiece: number | null;
    units: { unit: string; gramsPerUnit: number }[];
  } | null;
};

async function loadRecipeIngredients(
  recipeId: string,
): Promise<{ title: string; baseServings: number; rows: IngredientRow[] }> {
  const [recipe] = await db
    .select({
      title: recipes.title,
      baseServings: recipes.baseServings,
    })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  if (!recipe) throw new ApiError("not_found", "Recept nenalezen.");

  const rows = await db
    .select({
      ingredient: recipeIngredients,
      food: foods,
      isSpice: sql<boolean>`EXISTS (
        SELECT 1 FROM food_category_closure fcc
        JOIN food_categories fc ON fc.id = fcc.ancestor_id
        WHERE fcc.descendant_id = "foods"."food_category_id"
          AND fc.search_normalized = 'koreni'
      )`.as("is_spice"),
    })
    .from(recipeIngredients)
    .leftJoin(foods, eq(foods.id, recipeIngredients.foodId))
    .where(
      and(
        eq(recipeIngredients.recipeId, recipeId),
        isNull(recipeIngredients.deletedAt),
      ),
    )
    .orderBy(asc(recipeIngredients.sortOrder));

  const foodIds = rows
    .map((r) => r.food?.id)
    .filter((id): id is string => Boolean(id));
  const unitRows = foodIds.length
    ? await db
        .select()
        .from(foodUnits)
        .where(
          and(inArray(foodUnits.foodId, foodIds), isNull(foodUnits.deletedAt)),
        )
    : [];

  return {
    title: recipe.title,
    baseServings: recipe.baseServings,
    rows: rows.map((row) => ({
      foodId: row.ingredient.foodId,
      name: row.food?.name ?? row.ingredient.freeText ?? "",
      amount: row.ingredient.amount,
      unit: row.ingredient.unit,
      note: row.ingredient.note,
      isOptional: row.ingredient.isOptional,
      isSpice: row.isSpice ?? false,
      divisiblePieces: row.food?.divisiblePieces ?? false,
      food: row.food
        ? {
            densityGPerMl: row.food.densityGPerMl,
            gramsPerPiece: row.food.gramsPerPiece,
            units: unitRows
              .filter((u) => u.foodId === row.food!.id)
              .map((u) => ({ unit: u.unit, gramsPerUnit: u.gramsPerUnit })),
          }
        : null,
    })),
  };
}

function toMergeInputs(
  rows: IngredientRow[],
  baseServings: number,
  targetServings: number,
  sourceLabel: string,
  source: { recipeId?: string | null; mealPlanEntryId?: string | null },
): MergeInput[] {
  return rows
    .filter((row) => row.name.trim() !== "")
    .map((row) => {
      const scaled = scaleIngredient(
        {
          amount: row.amount,
          unit: row.unit,
          isSpice: row.isSpice,
          divisiblePieces: row.divisiblePieces,
        },
        targetServings,
        baseServings,
      );
      const amount = scaled.rounded ?? row.amount;
      return {
        foodId: row.foodId,
        name: row.name,
        amount,
        unit: row.unit,
        note: row.note,
        food: row.food,
        source: {
          ...source,
          label: sourceLabel,
          amount,
          unit: row.unit,
        },
      };
    });
}

/** Writes merged items into the list, combining with what is already there. */
async function writeMerged(
  actor: Actor,
  listId: string,
  incoming: MergeInput[],
): Promise<{ added: number; merged: number }> {
  // Existing unchecked items participate in the merge so repeated imports
  // top up quantities instead of creating duplicates.
  const existing = await db
    .select({
      item: shoppingItems,
      foodName: foods.name,
    })
    .from(shoppingItems)
    .leftJoin(foods, eq(foods.id, shoppingItems.foodId))
    .where(
      and(
        eq(shoppingItems.shoppingListId, listId),
        isNull(shoppingItems.deletedAt),
        eq(shoppingItems.isChecked, false),
      ),
    );

  // Carry the existing sources through the merge, otherwise re-importing
  // would erase where the earlier quantities came from (zadání §6.5).
  const existingSources = existing.length
    ? await db
        .select()
        .from(shoppingItemSources)
        .where(
          and(
            inArray(
              shoppingItemSources.shoppingItemId,
              existing.map((row) => row.item.id),
            ),
            isNull(shoppingItemSources.deletedAt),
          ),
        )
    : [];

  const existingInputs: MergeInput[] = existing.map((row) => {
    const sources = existingSources.filter(
      (s) => s.shoppingItemId === row.item.id,
    );
    return {
      foodId: row.item.foodId,
      name: row.foodName ?? row.item.freeText ?? "",
      amount: row.item.amount,
      unit: row.item.unit,
      note: row.item.note,
      food: null,
      source: {
        label: MANUAL_SOURCE,
        amount: row.item.amount,
        unit: row.item.unit,
      },
      // Preserved verbatim; re-attached to the merged row below.
      carriedSources: sources.map((s) => ({
        recipeId: s.recipeId,
        mealPlanEntryId: s.mealPlanEntryId,
        label: s.label,
        amount: s.amount,
        unit: s.unit,
      })),
    };
  });

  const merged = mergeShoppingItems([...existingInputs, ...incoming]);

  const foodIds = merged
    .map((m) => m.foodId)
    .filter((id): id is string => Boolean(id));
  const sectionMap = await resolveStoreSections(actor.householdId, foodIds);

  let added = 0;
  let mergedCount = 0;

  await db.transaction(async (tx) => {
    // Replace the unchecked part of the list with the merged result; checked
    // items are left untouched so shopping in progress is never disturbed.
    if (existing.length) {
      await tx
        .update(shoppingItems)
        .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
        .where(
          and(
            eq(shoppingItems.shoppingListId, listId),
            isNull(shoppingItems.deletedAt),
            eq(shoppingItems.isChecked, false),
          ),
        );
    }

    for (const [index, item] of merged.entries()) {
      const itemId = uuidv7();
      // A line touched by more than one contribution counts as merged.
      const realSources = item.sources.filter((s) => s.label !== MANUAL_SOURCE);
      if (item.sources.length > 1) mergedCount++;
      else added++;

      await tx.insert(shoppingItems).values({
        id: itemId,
        householdId: actor.householdId,
        shoppingListId: listId,
        foodId: item.foodId,
        freeText: item.name,
        amount: item.amount,
        unit: item.unit as never,
        note: item.note,
        storeSectionId: item.foodId
          ? (sectionMap.get(item.foodId) ?? null)
          : null,
        sortOrder: index,
        lastModifiedBy: actor.userId,
      });

      if (realSources.length) {
        await tx.insert(shoppingItemSources).values(
          realSources.map((s) => ({
            id: uuidv7(),
            householdId: actor.householdId,
            shoppingItemId: itemId,
            recipeId: s.recipeId ?? null,
            mealPlanEntryId: s.mealPlanEntryId ?? null,
            amount: s.amount,
            unit: s.unit as never,
            label: s.label,
          })),
        );
      }
    }
  });

  return { added, merged: mergedCount };
}

export async function importRecipeIntoList(
  actor: Actor,
  listId: string,
  recipeId: string,
  servings?: number,
) {
  const { title, baseServings, rows } = await loadRecipeIngredients(recipeId);
  const target = servings ?? baseServings;
  const inputs = toMergeInputs(rows, baseServings, target, title, { recipeId });
  return writeMerged(actor, listId, inputs);
}

export async function importMealPlanIntoList(
  actor: Actor,
  listId: string,
  from: string,
  to: string,
) {
  const entries = await db
    .select({
      id: mealPlanEntries.id,
      date: mealPlanEntries.date,
      recipeId: mealPlanEntries.recipeId,
      servings: mealPlanEntries.servings,
    })
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.householdId, actor.householdId),
        isNull(mealPlanEntries.deletedAt),
        gte(mealPlanEntries.date, from),
        lte(mealPlanEntries.date, to),
      ),
    );

  const inputs: MergeInput[] = [];
  for (const entry of entries) {
    if (!entry.recipeId) continue;
    const { title, baseServings, rows } = await loadRecipeIngredients(
      entry.recipeId,
    );
    const dayLabel = new Date(`${entry.date}T00:00:00`).toLocaleDateString(
      "cs-CZ",
      { weekday: "short", day: "numeric", month: "numeric" },
    );
    inputs.push(
      ...toMergeInputs(
        rows,
        baseServings,
        entry.servings ?? baseServings,
        `${title} (${dayLabel})`,
        { recipeId: entry.recipeId, mealPlanEntryId: entry.id },
      ),
    );
  }
  if (inputs.length === 0) {
    throw new ApiError(
      "not_found",
      "V tomto období nejsou v jídelníčku žádné recepty.",
    );
  }
  return writeMerged(actor, listId, inputs);
}
