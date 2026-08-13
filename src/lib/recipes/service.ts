import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  foods,
  recipeCategories,
  recipeIngredientGroups,
  recipeIngredients,
  recipePhotos,
  recipePrepAhead,
  recipeStepIngredients,
  recipeSteps,
  recipeTags,
  recipes,
} from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import type { RecipeListQuery, RecipeUpsert } from "@/lib/schemas/recipes";

type Actor = { userId: string; householdId: string };

/* ------------------------------------------------------------------ */
/* List + search                                                      */
/* ------------------------------------------------------------------ */

export async function listRecipes(actor: Actor, query: RecipeListQuery) {
  const conditions: SQL[] = [
    eq(recipes.householdId, actor.householdId),
    isNull(recipes.deletedAt),
    sql`(${recipes.visibility} <> 'private' OR ${recipes.ownerId} = ${actor.userId})`,
  ];

  if (query.q) {
    // Diacritics-insensitive substring, word-level fuzzy match (handles typos
    // AND Czech inflection: "cocka" ~ "cocky"), full-text, or a matching
    // linked ingredient name.
    conditions.push(sql`(
      ${recipes.searchNormalized} LIKE '%' || immutable_unaccent(lower(${query.q})) || '%'
      OR word_similarity(immutable_unaccent(lower(${query.q})), ${recipes.searchNormalized}) > 0.4
      OR search_tsv @@ plainto_tsquery('simple', immutable_unaccent(lower(${query.q})))
      OR EXISTS (
        SELECT 1 FROM recipe_ingredients ri
        LEFT JOIN foods f ON f.id = ri.food_id
        WHERE ri.recipe_id = ${recipes.id} AND ri.deleted_at IS NULL
          AND (
            f.search_normalized LIKE '%' || immutable_unaccent(lower(${query.q})) || '%'
            OR word_similarity(immutable_unaccent(lower(${query.q})), f.search_normalized) > 0.4
            OR immutable_unaccent(lower(coalesce(ri.free_text, ''))) LIKE '%' || immutable_unaccent(lower(${query.q})) || '%'
          )
      )
    )`);
  }
  if (query.categoryId) {
    // Category including its whole subtree via the closure table.
    conditions.push(sql`EXISTS (
      SELECT 1 FROM recipe_categories rc
      JOIN category_closure cc ON cc.descendant_id = rc.category_id
      WHERE rc.recipe_id = ${recipes.id} AND cc.ancestor_id = ${query.categoryId}
    )`);
  }
  for (const tagId of query.tagIds ?? []) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM recipe_tags rt
      WHERE rt.recipe_id = ${recipes.id} AND rt.tag_id = ${tagId}
    )`);
  }
  if (query.difficulty) {
    conditions.push(eq(recipes.difficulty, query.difficulty));
  }
  if (query.maxTotalTime) {
    conditions.push(sql`${recipes.totalTimeMin} <= ${query.maxTotalTime}`);
  }
  if (query.includeFoodId) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM recipe_ingredients ri
      WHERE ri.recipe_id = ${recipes.id} AND ri.deleted_at IS NULL
        AND ri.food_id = ${query.includeFoodId}
    )`);
  }
  if (query.excludeFoodId) {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM recipe_ingredients ri
      WHERE ri.recipe_id = ${recipes.id} AND ri.deleted_at IS NULL
        AND ri.food_id = ${query.excludeFoodId}
    )`);
  }
  if (query.includeFoodCategoryId) {
    // "Recipes containing anything from the Legumes group" (§5.4)
    conditions.push(sql`EXISTS (
      SELECT 1 FROM recipe_ingredients ri
      JOIN foods f ON f.id = ri.food_id
      JOIN food_category_closure fcc ON fcc.descendant_id = f.food_category_id
      WHERE ri.recipe_id = ${recipes.id} AND ri.deleted_at IS NULL
        AND fcc.ancestor_id = ${query.includeFoodCategoryId}
    )`);
  }
  if (query.excludeFoodCategoryId) {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM recipe_ingredients ri
      JOIN foods f ON f.id = ri.food_id
      JOIN food_category_closure fcc ON fcc.descendant_id = f.food_category_id
      WHERE ri.recipe_id = ${recipes.id} AND ri.deleted_at IS NULL
        AND fcc.ancestor_id = ${query.excludeFoodCategoryId}
    )`);
  }

  const orderBy: SQL[] = [];
  if (query.q) {
    orderBy.push(
      sql`similarity(${recipes.searchNormalized}, immutable_unaccent(lower(${query.q}))) DESC`,
    );
  }
  if (query.sort === "title") orderBy.push(asc(recipes.searchNormalized));
  else if (query.sort === "time")
    orderBy.push(sql`${recipes.totalTimeMin} ASC NULLS LAST`);
  else orderBy.push(desc(recipes.createdAt));

  const offset = query.cursor ? parseInt(query.cursor, 10) || 0 : 0;

  const items = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      baseServings: recipes.baseServings,
      totalTimeMin: recipes.totalTimeMin,
      difficulty: recipes.difficulty,
      visibility: recipes.visibility,
      ownerId: recipes.ownerId,
      createdAt: recipes.createdAt,
      // NB: keep "recipes"."id" fully qualified — an interpolated column in a
      // select-field subquery renders unqualified and would bind to rp.id.
      mainPhotoKey: sql<string | null>`(
        SELECT rp.storage_key FROM recipe_photos rp
        WHERE rp.recipe_id = "recipes"."id" AND rp.deleted_at IS NULL
        ORDER BY rp.is_main DESC, rp.sort_order ASC LIMIT 1
      )`.as("main_photo_key"),
    })
    .from(recipes)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(query.limit + 1)
    .offset(offset);

  const hasMore = items.length > query.limit;
  return {
    items: items.slice(0, query.limit),
    nextCursor: hasMore ? String(offset + query.limit) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Detail aggregate                                                   */
/* ------------------------------------------------------------------ */

export async function getRecipeAggregate(recipeId: string) {
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  if (!recipe) throw new ApiError("not_found", "Recept nenalezen.");

  const [groups, ingredients, steps, stepLinks, photos, catLinks, tagLinks, prep] =
    await Promise.all([
      db
        .select()
        .from(recipeIngredientGroups)
        .where(
          and(
            eq(recipeIngredientGroups.recipeId, recipeId),
            isNull(recipeIngredientGroups.deletedAt),
          ),
        )
        .orderBy(asc(recipeIngredientGroups.sortOrder)),
      db
        .select({
          ingredient: recipeIngredients,
          foodName: foods.name,
        })
        .from(recipeIngredients)
        .leftJoin(foods, eq(foods.id, recipeIngredients.foodId))
        .where(
          and(
            eq(recipeIngredients.recipeId, recipeId),
            isNull(recipeIngredients.deletedAt),
          ),
        )
        .orderBy(asc(recipeIngredients.sortOrder)),
      db
        .select()
        .from(recipeSteps)
        .where(
          and(eq(recipeSteps.recipeId, recipeId), isNull(recipeSteps.deletedAt)),
        )
        .orderBy(asc(recipeSteps.sortOrder)),
      db
        .select()
        .from(recipeStepIngredients)
        .where(
          inArray(
            recipeStepIngredients.stepId,
            db
              .select({ id: recipeSteps.id })
              .from(recipeSteps)
              .where(eq(recipeSteps.recipeId, recipeId)),
          ),
        ),
      db
        .select()
        .from(recipePhotos)
        .where(
          and(
            eq(recipePhotos.recipeId, recipeId),
            isNull(recipePhotos.deletedAt),
          ),
        )
        .orderBy(desc(recipePhotos.isMain), asc(recipePhotos.sortOrder)),
      db
        .select({ categoryId: recipeCategories.categoryId })
        .from(recipeCategories)
        .where(eq(recipeCategories.recipeId, recipeId)),
      db
        .select({ tagId: recipeTags.tagId })
        .from(recipeTags)
        .where(eq(recipeTags.recipeId, recipeId)),
      db
        .select()
        .from(recipePrepAhead)
        .where(
          and(
            eq(recipePrepAhead.recipeId, recipeId),
            isNull(recipePrepAhead.deletedAt),
          ),
        )
        .limit(1),
    ]);

  return {
    ...recipe,
    groups,
    ingredients: ingredients.map((row) => ({
      ...row.ingredient,
      foodName: row.foodName,
    })),
    steps: steps.map((s) => ({
      ...s,
      ingredientIds: stepLinks
        .filter((l) => l.stepId === s.id)
        .map((l) => l.ingredientId),
    })),
    photos,
    categoryIds: catLinks.map((c) => c.categoryId),
    tagIds: tagLinks.map((t) => t.tagId),
    prepAhead: prep[0] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Upsert aggregate                                                   */
/* ------------------------------------------------------------------ */

export async function upsertRecipe(
  actor: Actor,
  input: RecipeUpsert,
  { isNew }: { isNew: boolean },
) {
  await db.transaction(async (tx) => {
    const base = {
      title: input.title,
      intro: input.intro ?? null,
      baseServings: input.baseServings,
      prepTimeMin: input.prepTimeMin ?? null,
      cookTimeMin: input.cookTimeMin ?? null,
      difficulty: input.difficulty ?? null,
      source: input.source ?? null,
      notes: input.notes ?? null,
      visibility: input.visibility,
      lastModifiedBy: actor.userId,
    };

    if (isNew) {
      await tx.insert(recipes).values({
        id: input.id,
        householdId: actor.householdId,
        ownerId: actor.userId,
        ...base,
      });
    } else {
      await tx.update(recipes).set(base).where(eq(recipes.id, input.id));
    }

    const common = {
      householdId: actor.householdId,
      recipeId: input.id,
      lastModifiedBy: actor.userId,
    };

    /* Ingredient groups: upsert present, soft-delete missing */
    const groupIds = input.groups.map((g) => g.id);
    await tx
      .update(recipeIngredientGroups)
      .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
      .where(
        and(
          eq(recipeIngredientGroups.recipeId, input.id),
          isNull(recipeIngredientGroups.deletedAt),
          groupIds.length
            ? notInArray(recipeIngredientGroups.id, groupIds)
            : sql`TRUE`,
        ),
      );
    for (const g of input.groups) {
      await tx
        .insert(recipeIngredientGroups)
        .values({ ...common, id: g.id, name: g.name, sortOrder: g.sortOrder })
        .onConflictDoUpdate({
          target: recipeIngredientGroups.id,
          set: {
            name: g.name,
            sortOrder: g.sortOrder,
            deletedAt: null,
            lastModifiedBy: actor.userId,
          },
        });
    }

    /* Ingredients */
    const ingredientIds = input.ingredients.map((i) => i.id);
    await tx
      .update(recipeIngredients)
      .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
      .where(
        and(
          eq(recipeIngredients.recipeId, input.id),
          isNull(recipeIngredients.deletedAt),
          ingredientIds.length
            ? notInArray(recipeIngredients.id, ingredientIds)
            : sql`TRUE`,
        ),
      );
    for (const i of input.ingredients) {
      const values = {
        groupId: i.groupId ?? null,
        foodId: i.foodId ?? null,
        freeText: i.freeText ?? null,
        amount: i.amount ?? null,
        unit: i.unit ?? null,
        note: i.note ?? null,
        isOptional: i.isOptional,
        sortOrder: i.sortOrder,
        nutritionOverride: i.nutritionOverride ?? null,
      };
      await tx
        .insert(recipeIngredients)
        .values({ ...common, id: i.id, ...values })
        .onConflictDoUpdate({
          target: recipeIngredients.id,
          set: { ...values, deletedAt: null, lastModifiedBy: actor.userId },
        });
    }

    /* Steps */
    const stepIds = input.steps.map((s) => s.id);
    await tx
      .update(recipeSteps)
      .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
      .where(
        and(
          eq(recipeSteps.recipeId, input.id),
          isNull(recipeSteps.deletedAt),
          stepIds.length
            ? notInArray(recipeSteps.id, stepIds)
            : sql`TRUE`,
        ),
      );
    for (const s of input.steps) {
      const values = {
        text: s.text,
        sortOrder: s.sortOrder,
        photoId: s.photoId ?? null,
      };
      await tx
        .insert(recipeSteps)
        .values({ ...common, id: s.id, ...values })
        .onConflictDoUpdate({
          target: recipeSteps.id,
          set: { ...values, deletedAt: null, lastModifiedBy: actor.userId },
        });
    }

    /* Step-ingredient links: replace wholesale (pure M:N, §1.3) */
    if (stepIds.length) {
      await tx
        .delete(recipeStepIngredients)
        .where(inArray(recipeStepIngredients.stepId, stepIds));
    }
    const stepLinks = input.steps.flatMap((s) =>
      s.ingredientIds
        .filter((iid) => ingredientIds.includes(iid))
        .map((iid) => ({ stepId: s.id, ingredientId: iid })),
    );
    if (stepLinks.length) {
      await tx.insert(recipeStepIngredients).values(stepLinks);
    }

    /* Category + tag links: replace wholesale */
    await tx
      .delete(recipeCategories)
      .where(eq(recipeCategories.recipeId, input.id));
    if (input.categoryIds.length) {
      await tx.insert(recipeCategories).values(
        input.categoryIds.map((categoryId) => ({
          recipeId: input.id,
          categoryId,
        })),
      );
    }
    await tx.delete(recipeTags).where(eq(recipeTags.recipeId, input.id));
    if (input.tagIds.length) {
      await tx
        .insert(recipeTags)
        .values(input.tagIds.map((tagId) => ({ recipeId: input.id, tagId })));
    }

    /* Prep-ahead: single optional row */
    await tx
      .update(recipePrepAhead)
      .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
      .where(
        and(
          eq(recipePrepAhead.recipeId, input.id),
          isNull(recipePrepAhead.deletedAt),
          input.prepAhead
            ? sql`${recipePrepAhead.id} <> ${input.prepAhead.id}`
            : sql`TRUE`,
        ),
      );
    if (input.prepAhead) {
      await tx
        .insert(recipePrepAhead)
        .values({
          ...common,
          id: input.prepAhead.id,
          leadTimeHours: input.prepAhead.leadTimeHours,
          description: input.prepAhead.description,
        })
        .onConflictDoUpdate({
          target: recipePrepAhead.id,
          set: {
            leadTimeHours: input.prepAhead.leadTimeHours,
            description: input.prepAhead.description,
            deletedAt: null,
            lastModifiedBy: actor.userId,
          },
        });
    }

    if (!isNew) {
      // Touch the parent so M:N link changes reach the change_log (§1.3).
      await tx
        .update(recipes)
        .set({ lastModifiedBy: actor.userId })
        .where(eq(recipes.id, input.id));
    }
  });

  return getRecipeAggregate(input.id);
}

export async function softDeleteRecipe(actor: Actor, recipeId: string) {
  await db
    .update(recipes)
    .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
    .where(eq(recipes.id, recipeId));
}
