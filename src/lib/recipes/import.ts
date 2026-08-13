import { and, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { db } from "@/db/client";
import { UNITS, categories, foods, tags } from "@/db/schema";
import { createCategory } from "@/lib/categories/service";
import { upsertRecipe } from "@/lib/recipes/service";

/** Import format — documented for users in docs/IMPORT-RECIPES.md. */
export const importIngredientSchema = z.object({
  name: z.string().trim().min(1).max(300),
  amount: z.number().nullish(),
  unit: z.enum(UNITS).nullish(),
  group: z.string().trim().max(100).nullish(),
  note: z.string().trim().max(300).nullish(),
  optional: z.boolean().default(false),
});

export const importRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  intro: z.string().trim().max(2000).nullish(),
  baseServings: z.number().int().positive().max(100),
  prepTimeMin: z.number().int().nonnegative().max(10000).nullish(),
  cookTimeMin: z.number().int().nonnegative().max(10000).nullish(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullish(),
  source: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  categories: z.array(z.string().trim().min(1).max(100)).default([]),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  ingredientGroups: z.array(z.string().trim().min(1).max(100)).default([]),
  ingredients: z.array(importIngredientSchema).default([]),
  steps: z.array(z.string().trim().min(1).max(4000)).default([]),
  prepAhead: z
    .object({
      leadTimeHours: z.number().int().positive().max(24 * 30),
      description: z.string().trim().min(1).max(300),
    })
    .nullish(),
});

export const importFileSchema = z.object({
  formatVersion: z.literal(1),
  recipes: z.array(importRecipeSchema).min(1).max(500),
});
export type ImportFile = z.infer<typeof importFileSchema>;

export type ImportPreview = {
  recipes: {
    title: string;
    ingredientCount: number;
    matchedCount: number;
    unmatched: string[];
    stepCount: number;
    newCategories: string[];
    newTags: string[];
  }[];
  totals: {
    recipes: number;
    ingredients: number;
    matched: number;
    newCategories: number;
    newTags: number;
  };
};

/**
 * Must produce the same string as the DB's `immutable_unaccent(lower(name))`
 * so that comparisons against `search_normalized` line up.
 * U+0300–U+036F is the combining-diacritics block (written as escapes so the
 * range cannot be mangled by editors).
 */
const normalize = (value: string) =>
  value
    .toLocaleLowerCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type FoodMatch = { id: string; name: string };

/**
 * Matches an ingredient name against the household's foods: exact normalized
 * match first, then trigram similarity (typos, inflection). Never guesses
 * below the similarity threshold — an unmatched ingredient simply stays free
 * text (docs/IMPORT-RECIPES.md §3).
 */
async function matchFood(
  householdId: string,
  name: string,
): Promise<FoodMatch | null> {
  const normalized = normalize(name);
  const [exact] = await db
    .select({ id: foods.id, name: foods.name })
    .from(foods)
    .where(
      and(
        eq(foods.householdId, householdId),
        isNull(foods.deletedAt),
        eq(foods.searchNormalized, normalized),
      ),
    )
    .limit(1);
  if (exact) return exact;

  const [fuzzy] = await db
    .select({ id: foods.id, name: foods.name })
    .from(foods)
    .where(
      and(
        eq(foods.householdId, householdId),
        isNull(foods.deletedAt),
        sql`similarity(${foods.searchNormalized}, ${normalized}) > 0.55`,
      ),
    )
    .orderBy(sql`similarity(${foods.searchNormalized}, ${normalized}) DESC`)
    .limit(1);
  return fuzzy ?? null;
}

async function existingNames(
  table: typeof categories | typeof tags,
  householdId: string,
) {
  const rows = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(and(eq(table.householdId, householdId), isNull(table.deletedAt)));
  return new Map(rows.map((row) => [normalize(row.name), row.id]));
}

export async function previewImport(
  householdId: string,
  file: ImportFile,
): Promise<ImportPreview> {
  const categoryMap = await existingNames(categories, householdId);
  const tagMap = await existingNames(tags, householdId);
  const seenNewCategories = new Set<string>();
  const seenNewTags = new Set<string>();

  const recipes: ImportPreview["recipes"] = [];
  let matchedTotal = 0;
  let ingredientTotal = 0;

  for (const recipe of file.recipes) {
    const unmatched: string[] = [];
    let matched = 0;
    for (const ingredient of recipe.ingredients) {
      const food = await matchFood(householdId, ingredient.name);
      if (food) matched++;
      else unmatched.push(ingredient.name);
    }
    const newCategories = recipe.categories.filter((name) => {
      const key = normalize(name);
      if (categoryMap.has(key) || seenNewCategories.has(key)) return false;
      seenNewCategories.add(key);
      return true;
    });
    const newTags = recipe.tags.filter((name) => {
      const key = normalize(name);
      if (tagMap.has(key) || seenNewTags.has(key)) return false;
      seenNewTags.add(key);
      return true;
    });

    matchedTotal += matched;
    ingredientTotal += recipe.ingredients.length;
    recipes.push({
      title: recipe.title,
      ingredientCount: recipe.ingredients.length,
      matchedCount: matched,
      unmatched,
      stepCount: recipe.steps.length,
      newCategories,
      newTags,
    });
  }

  return {
    recipes,
    totals: {
      recipes: file.recipes.length,
      ingredients: ingredientTotal,
      matched: matchedTotal,
      newCategories: seenNewCategories.size,
      newTags: seenNewTags.size,
    },
  };
}

export async function runImport(
  actor: { userId: string; householdId: string },
  file: ImportFile,
): Promise<{ created: string[] }> {
  const categoryMap = await existingNames(categories, actor.householdId);
  const tagMap = await existingNames(tags, actor.householdId);
  const created: string[] = [];

  for (const recipe of file.recipes) {
    /* Categories: reuse by name, otherwise create at the top level. */
    const categoryIds: string[] = [];
    for (const name of recipe.categories) {
      const key = normalize(name);
      let id = categoryMap.get(key);
      if (!id) {
        id = uuidv7();
        await createCategory(actor, { id, name, sortOrder: 999 });
        categoryMap.set(key, id);
      }
      categoryIds.push(id);
    }

    /* Tags: reuse by name, otherwise create. */
    const tagIds: string[] = [];
    for (const name of recipe.tags) {
      const key = normalize(name);
      let id = tagMap.get(key);
      if (!id) {
        id = uuidv7();
        await db.insert(tags).values({
          id,
          householdId: actor.householdId,
          name,
          lastModifiedBy: actor.userId,
        });
        tagMap.set(key, id);
      }
      tagIds.push(id);
    }

    /* Ingredient groups keep their order from the file. */
    const groupIds = new Map<string, string>();
    const groups = recipe.ingredientGroups.map((name, index) => {
      const id = uuidv7();
      groupIds.set(normalize(name), id);
      return { id, name, sortOrder: index };
    });

    const ingredients = [];
    for (const [index, item] of recipe.ingredients.entries()) {
      const food = await matchFood(actor.householdId, item.name);
      ingredients.push({
        id: uuidv7(),
        groupId: item.group ? (groupIds.get(normalize(item.group)) ?? null) : null,
        foodId: food?.id ?? null,
        // Keep the original wording; the food link drives search and nutrition.
        freeText: item.name,
        amount: item.amount ?? null,
        unit: item.unit ?? null,
        note: item.note ?? null,
        isOptional: item.optional,
        sortOrder: index,
        nutritionOverride: null,
      });
    }

    const recipeId = uuidv7();
    await upsertRecipe(
      actor,
      {
        id: recipeId,
        title: recipe.title,
        intro: recipe.intro ?? null,
        baseServings: recipe.baseServings,
        prepTimeMin: recipe.prepTimeMin ?? null,
        cookTimeMin: recipe.cookTimeMin ?? null,
        difficulty: recipe.difficulty ?? null,
        source: recipe.source ?? null,
        notes: recipe.notes ?? null,
        visibility: "household",
        groups,
        ingredients,
        steps: recipe.steps.map((text, index) => ({
          id: uuidv7(),
          text,
          sortOrder: index,
          ingredientIds: [],
        })),
        categoryIds,
        tagIds,
        prepAhead: recipe.prepAhead
          ? { id: uuidv7(), ...recipe.prepAhead }
          : null,
      },
      { isNew: true },
    );
    created.push(recipeId);
  }

  return { created };
}
