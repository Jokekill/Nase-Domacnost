"use client";

import { getMeta, offlineDb, setMeta, type MirrorRow } from "./db";

/**
 * Offline reads from the mirror (docs/SYNC.md §6, priorities 1–4).
 *
 * Shapes match the online endpoints so screens can fall back without knowing
 * where the data came from. Fields the mirror cannot know (who ticked it,
 * recipe sources) come back empty rather than invented — an offline screen may
 * show less, never something made up.
 */

/** Diacritics-insensitive lower case — the client-side `immutable_unaccent`. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const alive = (row: MirrorRow) => !row.deletedAt;

/* ------------------------------------------------------------------ */
/* Shopping list (priority 2)                                         */
/* ------------------------------------------------------------------ */

export type OfflineShoppingList = {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  items: {
    id: string;
    /** Same field the online endpoint sends — the screen renders `name`. */
    name: string;
    amount: number | null;
    unit: string | null;
    note: string | null;
    storeSectionId: string | null;
    storeSectionName: string | null;
    storeSectionOrder: number | null;
    isChecked: boolean;
    checkedByName: string | null;
    sources: never[];
  }[];
  offline: true;
};

/** The list of lists — without it there is no way into the shopping list on a
 *  phone that lost signal on the way to the shop. */
export async function readShoppingListsFromMirror(): Promise<{
  items: {
    id: string;
    name: string;
    periodStart: string;
    periodEnd: string;
    total: number;
    checked: number;
  }[];
}> {
  const db = offlineDb();
  const [lists, items] = await Promise.all([
    db.mirror("shopping_lists").toArray(),
    db.mirror("shopping_items").toArray(),
  ]);
  const live = items.filter(alive);

  return {
    items: lists
      .filter(alive)
      .sort((a, b) =>
        String(b.periodStart ?? "").localeCompare(String(a.periodStart ?? "")),
      )
      .map((list) => {
        const mine = live.filter((item) => item.shoppingListId === list.id);
        return {
          id: list.id,
          name: list.name as string,
          periodStart: list.periodStart as string,
          periodEnd: list.periodEnd as string,
          total: mine.length,
          checked: mine.filter((item) => item.isChecked).length,
        };
      }),
  };
}

export async function readShoppingListFromMirror(
  listId: string,
): Promise<OfflineShoppingList | null> {
  const db = offlineDb();
  const list = await db.mirror("shopping_lists").get(listId);
  if (!list || list.deletedAt) return null;

  const [items, foods, sections] = await Promise.all([
    db
      .mirror("shopping_items")
      .where("shoppingListId")
      .equals(listId)
      .toArray(),
    db.mirror("foods").toArray(),
    db.mirror("store_sections").toArray(),
  ]);
  const foodName = new Map(foods.map((f) => [f.id, f.name as string]));
  const section = new Map(
    sections.map((s) => [
      s.id,
      { name: s.name as string, sortOrder: (s.sortOrder as number) ?? 999 },
    ]),
  );

  return {
    id: list.id,
    name: list.name as string,
    periodStart: list.periodStart as string,
    periodEnd: list.periodEnd as string,
    offline: true,
    items: items
      .filter((item) => !item.deletedAt)
      .map((item) => {
        const sec = item.storeSectionId
          ? section.get(item.storeSectionId as string)
          : undefined;
        return {
          id: item.id,
          name:
            (item.foodId ? foodName.get(item.foodId as string) : null) ??
            ((item.freeText as string) || "položka"),
          amount: (item.amount as number) ?? null,
          unit: (item.unit as string) ?? null,
          note: (item.note as string) ?? null,
          storeSectionId: (item.storeSectionId as string) ?? null,
          storeSectionName: sec?.name ?? null,
          storeSectionOrder: sec?.sortOrder ?? null,
          isChecked: Boolean(item.isChecked),
          checkedByName: null,
          sources: [] as never[],
        };
      })
      .sort(
        (a, b) =>
          (a.storeSectionOrder ?? 999) - (b.storeSectionOrder ?? 999) ||
          a.name.localeCompare(b.name, "cs"),
      ),
  };
}

/* ------------------------------------------------------------------ */
/* Cookbook (priority 1)                                              */
/* ------------------------------------------------------------------ */

/**
 * Offline recipe search. Deliberately weaker than the server: no trigram
 * similarity and no full-text index in IndexedDB, so this is substring
 * matching without diacritics over the title, the intro and the ingredient
 * names. Category/tag filters need link tables that are not mirrored, so the
 * screen tells the user they are not applied instead of applying them wrong.
 */
export async function readRecipeListFromMirror(query: {
  q?: string;
  difficulty?: string | null;
  maxTotalTime?: number | null;
}): Promise<{ items: OfflineRecipeListItem[]; nextCursor: null }> {
  const db = offlineDb();
  const [recipes, photos, ingredients, foods] = await Promise.all([
    db.mirror("recipes").toArray(),
    db.mirror("recipe_photos").toArray(),
    db.mirror("recipe_ingredients").toArray(),
    db.mirror("foods").toArray(),
  ]);

  const needle = query.q ? normalize(query.q.trim()) : "";
  const foodName = new Map(
    foods.map((f) => [f.id, normalize(f.name as string)]),
  );
  const matchingRecipeIds = new Set(
    needle
      ? ingredients
          .filter((row) => {
            if (!alive(row)) return false;
            const name = row.foodId
              ? (foodName.get(row.foodId as string) ?? "")
              : normalize((row.freeText as string) ?? "");
            return name.includes(needle);
          })
          .map((row) => row.recipeId as string)
      : [],
  );

  const items = recipes
    .filter(alive)
    .filter((recipe) => {
      if (query.difficulty && recipe.difficulty !== query.difficulty)
        return false;
      if (
        query.maxTotalTime != null &&
        ((recipe.totalTimeMin as number | null) ?? 0) > query.maxTotalTime
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = normalize(
        `${recipe.title as string} ${(recipe.intro as string) ?? ""}`,
      );
      return haystack.includes(needle) || matchingRecipeIds.has(recipe.id);
    })
    // Same default order as the server: newest first.
    .sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
    )
    .map((recipe) => ({
      id: recipe.id,
      title: recipe.title as string,
      baseServings: (recipe.baseServings as number) ?? 4,
      totalTimeMin: (recipe.totalTimeMin as number | null) ?? null,
      difficulty: (recipe.difficulty as string | null) ?? null,
      mainPhotoKey: mainPhotoOf(photos, recipe.id),
    }));

  return { items, nextCursor: null };
}

export type OfflineRecipeListItem = {
  id: string;
  title: string;
  baseServings: number;
  totalTimeMin: number | null;
  difficulty: string | null;
  mainPhotoKey: string | null;
};

function mainPhotoOf(photos: MirrorRow[], recipeId: string): string | null {
  const mine = photos
    .filter((photo) => alive(photo) && photo.recipeId === recipeId)
    .sort(
      (a, b) =>
        Number(Boolean(b.isMain)) - Number(Boolean(a.isMain)) ||
        ((a.sortOrder as number) ?? 0) - ((b.sortOrder as number) ?? 0),
    );
  return mine.length ? (mine[0].storageKey as string) : null;
}

/**
 * The recipe detail as the screens expect it. Two honest gaps: the mirror has
 * no user names (so "sdílí ti …" stays silent) and no way to check share
 * permissions, so everything that writes is switched off — offline editing is
 * not part of the push whitelist anyway (D-025).
 */
export async function readRecipeFromMirror(
  recipeId: string,
): Promise<Record<string, unknown> | null> {
  const db = offlineDb();
  const recipe = await db.mirror("recipes").get(recipeId);
  if (!recipe || !alive(recipe)) return null;

  const [groups, ingredients, steps, photos, prep, foods, units, categories] =
    await Promise.all([
      db
        .mirror("recipe_ingredient_groups")
        .where("recipeId")
        .equals(recipeId)
        .toArray(),
      db
        .mirror("recipe_ingredients")
        .where("recipeId")
        .equals(recipeId)
        .toArray(),
      db.mirror("recipe_steps").where("recipeId").equals(recipeId).toArray(),
      db.mirror("recipe_photos").where("recipeId").equals(recipeId).toArray(),
      db
        .mirror("recipe_prep_ahead")
        .where("recipeId")
        .equals(recipeId)
        .toArray(),
      db.mirror("foods").toArray(),
      db.mirror("food_units").toArray(),
      db.mirror("food_categories").toArray(),
    ]);

  const foodById = new Map(foods.filter(alive).map((food) => [food.id, food]));
  const spice = spiceCategoryIds(categories.filter(alive));
  const bySortOrder = (a: MirrorRow, b: MirrorRow) =>
    ((a.sortOrder as number) ?? 0) - ((b.sortOrder as number) ?? 0);

  return {
    ...recipe,
    ownerName: null,
    copiedFrom: null,
    permissions: { canEdit: false, canDelete: false, canShare: false },
    groups: groups.filter(alive).sort(bySortOrder),
    ingredients: ingredients
      .filter(alive)
      .sort(bySortOrder)
      .map((row) => {
        const food = row.foodId
          ? foodById.get(row.foodId as string)
          : undefined;
        return {
          ...row,
          foodName: (food?.name as string) ?? null,
          divisiblePieces: Boolean(food?.divisiblePieces),
          isSpice: Boolean(food && spice.has(food.foodCategoryId as string)),
          food: food
            ? {
                id: food.id,
                name: food.name,
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
                divisiblePieces: food.divisiblePieces,
                units: units
                  .filter((unit) => alive(unit) && unit.foodId === food.id)
                  .map((unit) => ({
                    unit: unit.unit,
                    gramsPerUnit: unit.gramsPerUnit,
                  })),
              }
            : null,
        };
      }),
    steps: steps
      .filter(alive)
      .sort(bySortOrder)
      // recipe_step_ingredients is a pure link table and is not mirrored;
      // nothing on the detail or cooking screen reads it.
      .map((step) => ({ ...step, ingredientIds: [] as string[] })),
    photos: photos
      .filter(alive)
      .sort(
        (a, b) =>
          Number(Boolean(b.isMain)) - Number(Boolean(a.isMain)) ||
          bySortOrder(a, b),
      ),
    categoryIds: [] as string[],
    tagIds: [] as string[],
    prepAhead: prep.filter(alive)[0] ?? null,
    offline: true,
  };
}

/** Food categories anywhere under "Koření" — the server does this with the
 *  closure table, offline we walk `parentId` upwards. */
function spiceCategoryIds(categories: MirrorRow[]): Set<string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const spice = new Set<string>();
  for (const category of categories) {
    let node: MirrorRow | undefined = category;
    const seen = new Set<string>();
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      if (normalize((node.name as string) ?? "") === "koreni") {
        spice.add(category.id);
        break;
      }
      node = node.parentId ? byId.get(node.parentId as string) : undefined;
    }
  }
  return spice;
}

/* ------------------------------------------------------------------ */
/* Tasks (priority 3)                                                 */
/* ------------------------------------------------------------------ */

export async function readTasksFromMirror(): Promise<{
  items: Record<string, unknown>[];
}> {
  const db = offlineDb();
  const [tasks, lists, members] = await Promise.all([
    db.mirror("tasks").toArray(),
    db.mirror("task_lists").toArray(),
    readCached<{ items: { userId: string; displayName: string }[] }>("members"),
  ]);
  const listName = new Map(lists.map((list) => [list.id, list.name as string]));
  const memberName = new Map(
    (members?.items ?? []).map((member) => [member.userId, member.displayName]),
  );

  const items = tasks
    .filter(alive)
    .sort(
      (a, b) =>
        String(a.status).localeCompare(String(b.status)) ||
        String(a.periodStart ?? "9999").localeCompare(
          String(b.periodStart ?? "9999"),
        ) ||
        String(a.name).localeCompare(String(b.name), "cs"),
    )
    .map((task) => ({
      ...task,
      taskListName: task.taskListId
        ? (listName.get(task.taskListId as string) ?? null)
        : null,
      // Who completed it is only known by name once the members list has been
      // seen online at least once.
      completedByName: task.completedBy
        ? (memberName.get(task.completedBy as string) ?? null)
        : null,
      assignees: ((task.assigneeIds as string[]) ?? []).map((userId) => ({
        userId,
        displayName: memberName.get(userId) ?? "člen domácnosti",
      })),
    }));

  return { items };
}

/* ------------------------------------------------------------------ */
/* Diary (priority 4)                                                 */
/* ------------------------------------------------------------------ */

/** The mirror only ever holds MY diary (`perUser` in the sync registry). */
export async function readDiaryFromMirror(
  from: string,
  to: string,
): Promise<{ items: Record<string, unknown>[] }> {
  const db = offlineDb();
  const [entries, mealTypes] = await Promise.all([
    db.mirror("diary_entries").toArray(),
    db.mirror("meal_types").toArray(),
  ]);
  const meal = new Map(
    mealTypes.map((type) => [
      type.id,
      {
        name: type.name as string,
        sortOrder: (type.sortOrder as number) ?? 999,
      },
    ]),
  );

  const items = entries
    .filter(
      (entry) =>
        alive(entry) && String(entry.date) >= from && String(entry.date) <= to,
    )
    .map((entry): Record<string, unknown> => ({
      ...entry,
      mealTypeName: entry.mealTypeId
        ? (meal.get(entry.mealTypeId as string)?.name ?? null)
        : null,
      mealTypeOrder: entry.mealTypeId
        ? (meal.get(entry.mealTypeId as string)?.sortOrder ?? 999)
        : 999,
    }))
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        (a.mealTypeOrder as number) - (b.mealTypeOrder as number) ||
        String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
    );

  return { items };
}

/** Day totals summed from the stored snapshots — the same arithmetic the
 *  server does, over the same numbers (D-022). */
export async function readDiarySummaryFromMirror(
  from: string,
  to: string,
  nutrientKeys: readonly string[],
): Promise<Record<string, unknown>> {
  const { items } = await readDiaryFromMirror(from, to);
  const goals = await offlineDb().mirror("nutrition_goals").toArray();

  const byDate = new Map<
    string,
    { date: string; totals: Record<string, number | null>; incomplete: boolean }
  >();
  for (const entry of items) {
    const snapshot = (entry.nutrition ?? {}) as Record<string, unknown>;
    const date = String(entry.date);
    if (!byDate.has(date)) {
      byDate.set(date, { date, totals: {}, incomplete: false });
    }
    const day = byDate.get(date)!;
    for (const key of nutrientKeys) {
      const value = snapshot[key];
      if (typeof value !== "number") continue;
      day.totals[key] = (day.totals[key] ?? 0) + value;
    }
    if (snapshot.incomplete) day.incomplete = true;
  }

  const days = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  // Averages count only days with entries — an empty day would misrepresent
  // eating habits.
  const averages: Record<string, number | null> = {};
  for (const key of nutrientKeys) {
    const values = days
      .map((day) => day.totals[key])
      .filter((value): value is number => value != null);
    averages[key] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  return {
    days,
    averages,
    daysWithData: days.length,
    goals: goals.filter(alive).map((goal) => ({
      nutrientKey: goal.nutrientKey as string,
      targetPerDay: goal.targetPerDay as number,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Cached responses (things that are not synced entities)             */
/* ------------------------------------------------------------------ */

/**
 * Small helper for endpoints outside the sync protocol that a screen still
 * needs offline — who I am, who else is in the household, meal types. The last
 * successful answer is kept in Dexie `meta`; offline it is served from there.
 * It is a cache, not a mirror: nothing is ever computed from it.
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const fresh = await fetcher();
    await setMeta(`cache:${key}`, fresh).catch(() => undefined);
    return fresh;
  } catch (err) {
    const stored = await readCached<T>(key);
    if (stored != null) return stored;
    throw err;
  }
}

export async function readCached<T>(key: string): Promise<T | null> {
  try {
    return await getMeta<T | null>(`cache:${key}`, null);
  } catch {
    return null;
  }
}
