import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import {
  diaryEntries,
  foodUnits,
  foods,
  mealPlanEntries,
  mealTypes,
  nutritionGoals,
  recipeIngredients,
  recipes,
} from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import {
  NUTRIENT_KEYS,
  computeRecipeNutrition,
  type NutrientKey,
  type NutritionIngredient,
  type NutritionValues,
} from "@/lib/domain/nutrition";
import { sql } from "drizzle-orm";

type Actor = { userId: string; householdId: string };

/** What lands in `diary_entries.nutrition` — plain numbers plus honesty flags. */
export type NutritionSnapshot = NutritionValues & {
  incomplete: boolean;
  missing: string[];
};

const emptySnapshot = (): NutritionSnapshot => ({
  incomplete: false,
  missing: [],
});

function scaleSnapshot(
  values: NutritionValues,
  factor: number,
): NutritionValues {
  const out: NutritionValues = {};
  for (const key of NUTRIENT_KEYS) {
    const value = values[key];
    out[key] = value != null ? value * factor : null;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Building snapshots                                                 */
/* ------------------------------------------------------------------ */

/** Loads a recipe and computes its per-serving nutrition (server-side). */
async function recipePerServing(recipeId: string): Promise<{
  title: string;
  baseServings: number;
  perServing: NutritionValues;
  incomplete: boolean;
  missing: string[];
}> {
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
    .select({ ingredient: recipeIngredients, food: foods })
    .from(recipeIngredients)
    .leftJoin(foods, eq(foods.id, recipeIngredients.foodId))
    .where(
      and(
        eq(recipeIngredients.recipeId, recipeId),
        isNull(recipeIngredients.deletedAt),
      ),
    );

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

  const ingredients: NutritionIngredient[] = rows.map((row) => ({
    id: row.ingredient.id,
    amount: row.ingredient.amount,
    unit: row.ingredient.unit,
    isOptional: row.ingredient.isOptional,
    nutritionOverride: row.ingredient.nutritionOverride as NutritionValues | null,
    label: row.food?.name ?? row.ingredient.freeText ?? "ingredience",
    food: row.food
      ? {
          referenceUnit: row.food.referenceUnit,
          energyKj: row.food.energyKj,
          proteinG: row.food.proteinG,
          carbsG: row.food.carbsG,
          sugarsG: row.food.sugarsG,
          fiberG: row.food.fiberG,
          fatG: row.food.fatG,
          satFatG: row.food.satFatG,
          saltG: row.food.saltG,
          densityGPerMl: row.food.densityGPerMl,
          gramsPerPiece: row.food.gramsPerPiece,
          units: unitRows
            .filter((u) => u.foodId === row.food!.id)
            .map((u) => ({ unit: u.unit, gramsPerUnit: u.gramsPerUnit })),
        }
      : null,
  }));

  const nutrition = computeRecipeNutrition(ingredients, recipe.baseServings);
  return {
    title: recipe.title,
    baseServings: recipe.baseServings,
    perServing: nutrition.perServing,
    incomplete: nutrition.incomplete,
    missing: nutrition.missing.map((m) => `${m.label} (${m.reason})`),
  };
}

/** Nutrition of `amount` of a food in the given unit. */
async function foodPortion(
  foodId: string,
  amount: number,
  unit: string,
): Promise<{ title: string; snapshot: NutritionSnapshot }> {
  const [food] = await db
    .select()
    .from(foods)
    .where(and(eq(foods.id, foodId), isNull(foods.deletedAt)))
    .limit(1);
  if (!food) throw new ApiError("not_found", "Potravina nenalezena.");

  const units = await db
    .select()
    .from(foodUnits)
    .where(and(eq(foodUnits.foodId, foodId), isNull(foodUnits.deletedAt)));

  // Reuse the recipe engine for a single "ingredient" — one code path, one
  // set of conversion rules.
  const nutrition = computeRecipeNutrition(
    [
      {
        id: foodId,
        amount,
        unit,
        label: food.name,
        food: {
          referenceUnit: food.referenceUnit,
          energyKj: food.energyKj,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          sugarsG: food.sugarsG,
          fiberG: food.fiberG,
          fatG: food.fatG,
          satFatG: food.satFatG,
          saltG: food.saltG,
          densityGPerMl: food.densityGPerMl,
          gramsPerPiece: food.gramsPerPiece,
          units: units.map((u) => ({
            unit: u.unit,
            gramsPerUnit: u.gramsPerUnit,
          })),
        },
      },
    ],
    1,
  );

  return {
    title: food.name,
    snapshot: {
      ...nutrition.total,
      incomplete: nutrition.incomplete,
      missing: nutrition.missing.map((m) => `${m.label} (${m.reason})`),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Writing                                                            */
/* ------------------------------------------------------------------ */

export type CreateEntryInput = {
  id?: string;
  date: string;
  mealTypeId?: string | null;
  note?: string | null;
} & (
  | { sourceKind: "recipe"; recipeId: string; servings: number }
  | { sourceKind: "food"; foodId: string; amount: number; unit: string }
  | {
      sourceKind: "manual";
      title: string;
      amount?: number | null;
      unit?: string | null;
      nutrition: NutritionValues;
    }
);

export async function createDiaryEntry(
  actor: Actor,
  input: CreateEntryInput,
): Promise<{ id: string }> {
  const id = input.id ?? uuidv7();

  let title: string;
  let snapshot: NutritionSnapshot;
  let amount: number | null = null;
  let unit: string | null = null;
  let recipeId: string | null = null;
  let foodId: string | null = null;

  if (input.sourceKind === "recipe") {
    const recipe = await recipePerServing(input.recipeId);
    // Individual portions: Eliška 1, Vojta 1.5 → different numbers (§10.6).
    snapshot = {
      ...scaleSnapshot(recipe.perServing, input.servings),
      incomplete: recipe.incomplete,
      missing: recipe.missing,
    };
    title = recipe.title;
    amount = input.servings;
    unit = "porce";
    recipeId = input.recipeId;
  } else if (input.sourceKind === "food") {
    const food = await foodPortion(input.foodId, input.amount, input.unit);
    title = food.title;
    snapshot = food.snapshot;
    amount = input.amount;
    unit = input.unit;
    foodId = input.foodId;
  } else {
    title = input.title;
    amount = input.amount ?? null;
    unit = input.unit ?? null;
    // Hand-typed values are taken at face value; anything omitted stays null.
    snapshot = { ...emptySnapshot(), ...input.nutrition };
  }

  await db
    .insert(diaryEntries)
    .values({
      id,
      householdId: actor.householdId,
      userId: actor.userId,
      date: input.date,
      mealTypeId: input.mealTypeId ?? null,
      sourceKind: input.sourceKind,
      recipeId,
      foodId,
      title,
      amount,
      unit,
      note: input.note ?? null,
      nutrition: snapshot,
      lastModifiedBy: actor.userId,
    })
    .onConflictDoNothing();

  return { id };
}

/**
 * Copies chosen meal-plan entries into the diary. Explicit, never automatic —
 * the plan is intent, the diary is what actually happened (zadání §10.6).
 */
export async function copyFromMealPlan(
  actor: Actor,
  entryIds: string[],
  servingsOverride?: Record<string, number>,
): Promise<{ created: number; skipped: string[] }> {
  const entries = await db
    .select({
      id: mealPlanEntries.id,
      date: mealPlanEntries.date,
      mealTypeId: mealPlanEntries.mealTypeId,
      recipeId: mealPlanEntries.recipeId,
      freeText: mealPlanEntries.freeText,
      servings: mealPlanEntries.servings,
    })
    .from(mealPlanEntries)
    .where(
      and(
        inArray(mealPlanEntries.id, entryIds),
        eq(mealPlanEntries.householdId, actor.householdId),
        isNull(mealPlanEntries.deletedAt),
      ),
    );

  let created = 0;
  const skipped: string[] = [];

  for (const entry of entries) {
    const servings = servingsOverride?.[entry.id] ?? entry.servings ?? 1;
    if (entry.recipeId) {
      await createDiaryEntry(actor, {
        date: entry.date,
        mealTypeId: entry.mealTypeId,
        sourceKind: "recipe",
        recipeId: entry.recipeId,
        servings,
      });
      created++;
    } else {
      // Free-text meals have no nutrition to copy; record them as manual
      // entries with no values rather than inventing numbers.
      await createDiaryEntry(actor, {
        date: entry.date,
        mealTypeId: entry.mealTypeId,
        sourceKind: "manual",
        title: entry.freeText ?? "Jídlo",
        nutrition: {},
      });
      created++;
      skipped.push(entry.freeText ?? "Jídlo");
    }
  }

  return { created, skipped };
}

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

export async function listDiary(
  actor: Actor,
  from: string,
  to: string,
) {
  return db
    .select({
      id: diaryEntries.id,
      date: diaryEntries.date,
      mealTypeId: diaryEntries.mealTypeId,
      mealTypeName: mealTypes.name,
      mealTypeOrder: mealTypes.sortOrder,
      sourceKind: diaryEntries.sourceKind,
      recipeId: diaryEntries.recipeId,
      foodId: diaryEntries.foodId,
      title: diaryEntries.title,
      amount: diaryEntries.amount,
      unit: diaryEntries.unit,
      note: diaryEntries.note,
      nutrition: diaryEntries.nutrition,
    })
    .from(diaryEntries)
    .leftJoin(mealTypes, eq(mealTypes.id, diaryEntries.mealTypeId))
    .where(
      and(
        // Per-user scope — never widened to the household (§10.6).
        eq(diaryEntries.userId, actor.userId),
        isNull(diaryEntries.deletedAt),
        gte(diaryEntries.date, from),
        lte(diaryEntries.date, to),
      ),
    )
    .orderBy(
      asc(diaryEntries.date),
      sql`${mealTypes.sortOrder} ASC NULLS LAST`,
      asc(diaryEntries.createdAt),
    );
}

export type DailyTotals = {
  date: string;
  totals: NutritionValues;
  incomplete: boolean;
};

export async function getDiarySummary(
  actor: Actor,
  from: string,
  to: string,
): Promise<{
  days: DailyTotals[];
  averages: NutritionValues;
  daysWithData: number;
}> {
  const entries = await listDiary(actor, from, to);

  const byDate = new Map<string, DailyTotals>();
  for (const entry of entries) {
    const snapshot = entry.nutrition as NutritionSnapshot;
    if (!byDate.has(entry.date)) {
      byDate.set(entry.date, {
        date: entry.date,
        totals: {},
        incomplete: false,
      });
    }
    const day = byDate.get(entry.date)!;
    for (const key of NUTRIENT_KEYS) {
      const value = snapshot[key];
      if (value == null) continue;
      day.totals[key] = (day.totals[key] ?? 0) + value;
    }
    if (snapshot.incomplete) day.incomplete = true;
  }

  const days = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Averages count only days that actually have entries — an empty day would
  // otherwise drag the average down and misrepresent eating habits.
  const averages: NutritionValues = {};
  for (const key of NUTRIENT_KEYS) {
    const values = days
      .map((day) => day.totals[key])
      .filter((value): value is number => value != null);
    averages[key] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  return { days, averages, daysWithData: days.length };
}

/* ------------------------------------------------------------------ */
/* Goals                                                              */
/* ------------------------------------------------------------------ */

export async function listGoals(actor: Actor) {
  return db
    .select({
      nutrientKey: nutritionGoals.nutrientKey,
      targetPerDay: nutritionGoals.targetPerDay,
    })
    .from(nutritionGoals)
    .where(
      and(
        eq(nutritionGoals.userId, actor.userId),
        isNull(nutritionGoals.deletedAt),
      ),
    );
}

export async function setGoal(
  actor: Actor,
  nutrientKey: NutrientKey,
  targetPerDay: number | null,
): Promise<void> {
  if (targetPerDay == null) {
    await db
      .update(nutritionGoals)
      .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
      .where(
        and(
          eq(nutritionGoals.userId, actor.userId),
          eq(nutritionGoals.nutrientKey, nutrientKey),
        ),
      );
    return;
  }

  await db
    .insert(nutritionGoals)
    .values({
      id: uuidv7(),
      householdId: actor.householdId,
      userId: actor.userId,
      nutrientKey,
      targetPerDay,
      lastModifiedBy: actor.userId,
    })
    .onConflictDoUpdate({
      target: [nutritionGoals.userId, nutritionGoals.nutrientKey],
      set: {
        targetPerDay,
        deletedAt: null,
        lastModifiedBy: actor.userId,
      },
    });
}
