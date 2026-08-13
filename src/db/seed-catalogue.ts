import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { db } from "./client";
import {
  categories,
  categoryClosure,
  foodCategories,
  foodCategoryClosure,
  foodUnits,
  foods,
  mealTypes,
  storeSections,
  taskLists,
} from "./schema";

type SeedCategory = {
  key: string;
  name: string;
  children?: SeedCategory[];
};

type SeedFood = {
  name: string;
  category: string;
  referenceUnit?: "100g" | "100ml" | "piece";
  energyKj?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  sugarsG?: number | null;
  fiberG?: number | null;
  fatG?: number | null;
  satFatG?: number | null;
  saltG?: number | null;
  densityGPerMl?: number | null;
  gramsPerPiece?: number | null;
  divisiblePieces?: boolean;
  units?: { unit: string; gramsPerUnit: number }[];
};

type SeedFile = {
  foodCategories: SeedCategory[];
  foods: SeedFood[];
  recipeCategories: SeedCategory[];
  mealTypes: string[];
  taskLists: string[];
  storeSections: { name: string; foodCategories: string[] }[];
};

let cached: SeedFile | null = null;

export async function loadSeedFile(): Promise<SeedFile> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "seeds", "foods.json");
  cached = JSON.parse(await readFile(file, "utf8")) as SeedFile;
  return cached;
}

function flatten(
  nodes: SeedCategory[],
  parentKey: string | null = null,
): { key: string; name: string; parentKey: string | null; order: number }[] {
  const out: {
    key: string;
    name: string;
    parentKey: string | null;
    order: number;
  }[] = [];
  nodes.forEach((node, index) => {
    out.push({ key: node.key, name: node.name, parentKey, order: index });
    if (node.children) out.push(...flatten(node.children, node.key));
  });
  return out;
}

/** Accepts either the root db handle or a transaction. */
export type SeedTx = Pick<typeof db, "insert" | "execute">;

/**
 * Fills a brand-new household with the starter catalogue: food category tree,
 * ~200 common Czech foods with their conversions, and a recipe category tree.
 * Runs inside the caller's transaction when one is given.
 */
export async function seedHouseholdCatalogue(
  tx: SeedTx,
  householdId: string,
  userId: string,
): Promise<{
  foodCategories: number;
  foods: number;
  recipeCategories: number;
  storeSections: number;
  mealTypes: number;
}> {
  const seed = await loadSeedFile();

  /* ---- store sections (referenced by food categories) ---- */
  const sectionIds = new Map<string, string>();
  await tx.insert(storeSections).values(
    seed.storeSections.map((section, index) => {
      const id = uuidv7();
      sectionIds.set(section.name, id);
      return {
        id,
        householdId,
        name: section.name,
        sortOrder: index,
        lastModifiedBy: userId,
      };
    }),
  );
  // food category key -> store section id
  const sectionByFoodCategory = new Map<string, string>();
  for (const section of seed.storeSections) {
    for (const key of section.foodCategories) {
      sectionByFoodCategory.set(key, sectionIds.get(section.name)!);
    }
  }

  /* ---- food categories (+ closure) ---- */
  const foodCatIds = new Map<string, string>();
  const flatFoodCats = flatten(seed.foodCategories);
  for (const node of flatFoodCats) foodCatIds.set(node.key, uuidv7());

  await tx.insert(foodCategories).values(
    flatFoodCats.map((node) => ({
      id: foodCatIds.get(node.key)!,
      householdId,
      name: node.name,
      parentId: node.parentKey ? foodCatIds.get(node.parentKey)! : null,
      sortOrder: node.order,
      // Only top-level groups carry the mapping; children inherit it.
      storeSectionId: sectionByFoodCategory.get(node.key) ?? null,
      lastModifiedBy: userId,
    })),
  );
  // Closure rows: self-links first, then inherited ancestors (parents are
  // always inserted before their children by flatten()).
  for (const node of flatFoodCats) {
    const id = foodCatIds.get(node.key)!;
    await tx
      .insert(foodCategoryClosure)
      .values({ ancestorId: id, descendantId: id, depth: 0 });
    if (node.parentKey) {
      await tx.execute(sql`
        INSERT INTO food_category_closure (ancestor_id, descendant_id, depth)
        SELECT ancestor_id, ${id}, depth + 1
        FROM food_category_closure
        WHERE descendant_id = ${foodCatIds.get(node.parentKey)!}
      `);
    }
  }

  /* ---- foods (+ per-food unit conversions) ---- */
  const foodRows = seed.foods.map((food) => ({
    id: uuidv7(),
    householdId,
    name: food.name,
    foodCategoryId: foodCatIds.get(food.category) ?? null,
    referenceUnit: food.referenceUnit ?? "100g",
    energyKj: food.energyKj ?? null,
    proteinG: food.proteinG ?? null,
    carbsG: food.carbsG ?? null,
    sugarsG: food.sugarsG ?? null,
    fiberG: food.fiberG ?? null,
    fatG: food.fatG ?? null,
    satFatG: food.satFatG ?? null,
    saltG: food.saltG ?? null,
    densityGPerMl: food.densityGPerMl ?? null,
    gramsPerPiece: food.gramsPerPiece ?? null,
    divisiblePieces: food.divisiblePieces ?? false,
    source: "seed" as const,
    lastModifiedBy: userId,
  }));
  await tx.insert(foods).values(foodRows);

  const unitRows = seed.foods.flatMap((food, index) =>
    (food.units ?? []).map((u) => ({
      id: uuidv7(),
      householdId,
      foodId: foodRows[index].id,
      unit: u.unit,
      gramsPerUnit: u.gramsPerUnit,
      lastModifiedBy: userId,
    })),
  );
  if (unitRows.length) await tx.insert(foodUnits).values(unitRows);

  /* ---- recipe categories (+ closure) ---- */
  const recipeCatIds = new Map<string, string>();
  const flatRecipeCats = flatten(seed.recipeCategories);
  for (const node of flatRecipeCats) recipeCatIds.set(node.key, uuidv7());

  await tx.insert(categories).values(
    flatRecipeCats.map((node) => ({
      id: recipeCatIds.get(node.key)!,
      householdId,
      name: node.name,
      parentId: node.parentKey ? recipeCatIds.get(node.parentKey)! : null,
      sortOrder: node.order,
      lastModifiedBy: userId,
    })),
  );
  for (const node of flatRecipeCats) {
    const id = recipeCatIds.get(node.key)!;
    await tx
      .insert(categoryClosure)
      .values({ ancestorId: id, descendantId: id, depth: 0 });
    if (node.parentKey) {
      await tx.execute(sql`
        INSERT INTO category_closure (ancestor_id, descendant_id, depth)
        SELECT ancestor_id, ${id}, depth + 1
        FROM category_closure
        WHERE descendant_id = ${recipeCatIds.get(node.parentKey)!}
      `);
    }
  }

  /* ---- meal types and task lists ---- */
  await tx.insert(mealTypes).values(
    seed.mealTypes.map((name, index) => ({
      id: uuidv7(),
      householdId,
      name,
      sortOrder: index,
      lastModifiedBy: userId,
    })),
  );
  await tx.insert(taskLists).values(
    seed.taskLists.map((name, index) => ({
      id: uuidv7(),
      householdId,
      name,
      sortOrder: index,
      lastModifiedBy: userId,
    })),
  );

  return {
    foodCategories: flatFoodCats.length,
    foods: foodRows.length,
    recipeCategories: flatRecipeCats.length,
    storeSections: seed.storeSections.length,
    mealTypes: seed.mealTypes.length,
  };
}
