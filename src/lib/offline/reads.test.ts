/**
 * Offline reads over a real (fake) IndexedDB — the mirror is the only thing
 * standing between a kitchen with no signal and an empty screen, so the shapes
 * it produces are worth pinning down (docs/SYNC.md §6, D-026).
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { MIRROR_TABLES, offlineDb, type MirrorRow } from "./db";
import {
  normalize,
  readDiaryFromMirror,
  readDiarySummaryFromMirror,
  readRecipeFromMirror,
  readRecipeListFromMirror,
  readShoppingListFromMirror,
  readShoppingListsFromMirror,
  readTasksFromMirror,
} from "./reads";

const NUTRIENTS = ["energyKj", "proteinG"] as const;

async function seed(
  rows: Partial<Record<(typeof MIRROR_TABLES)[number], MirrorRow[]>>,
) {
  const db = offlineDb();
  for (const table of MIRROR_TABLES) {
    await db.mirror(table).clear();
    const values = rows[table];
    if (values?.length) await db.mirror(table).bulkPut(values as never);
  }
}

beforeEach(async () => {
  await seed({});
});

describe("normalize", () => {
  it("strips diacritics and case, like immutable_unaccent on the server", () => {
    expect(normalize("Babiččina BÁBOVKA")).toBe("babiccina babovka");
    expect(normalize("Čočka")).toBe("cocka");
  });
});

describe("readRecipeListFromMirror", () => {
  const recipes: MirrorRow[] = [
    {
      id: "r1",
      title: "Babiččina bábovka",
      intro: "Nedělní klasika",
      baseServings: 12,
      totalTimeMin: 75,
      difficulty: "easy",
      createdAt: "2026-08-01T10:00:00.000Z",
      deletedAt: null,
    },
    {
      id: "r2",
      title: "Čočková polévka",
      intro: null,
      baseServings: 4,
      totalTimeMin: 30,
      difficulty: "medium",
      createdAt: "2026-08-02T10:00:00.000Z",
      deletedAt: null,
    },
    {
      id: "r3",
      title: "Smazaný recept",
      baseServings: 2,
      totalTimeMin: 10,
      createdAt: "2026-08-03T10:00:00.000Z",
      deletedAt: "2026-08-04T10:00:00.000Z",
    },
  ];

  beforeEach(async () => {
    await seed({
      recipes,
      foods: [{ id: "f1", name: "Vejce slepičí", deletedAt: null }],
      recipe_ingredients: [
        { id: "i1", recipeId: "r1", foodId: "f1", deletedAt: null },
        { id: "i2", recipeId: "r2", freeText: "voda", deletedAt: null },
      ],
      recipe_photos: [
        {
          id: "p1",
          recipeId: "r1",
          storageKey: "a",
          isMain: false,
          sortOrder: 1,
          deletedAt: null,
        },
        {
          id: "p2",
          recipeId: "r1",
          storageKey: "b",
          isMain: true,
          sortOrder: 9,
          deletedAt: null,
        },
      ],
    });
  });

  it("hides soft-deleted recipes and sorts newest first", async () => {
    const { items } = await readRecipeListFromMirror({});
    expect(items.map((i) => i.title)).toEqual([
      "Čočková polévka",
      "Babiččina bábovka",
    ]);
  });

  it("finds by title without diacritics", async () => {
    const { items } = await readRecipeListFromMirror({ q: "babovka" });
    expect(items.map((i) => i.id)).toEqual(["r1"]);
  });

  it("finds by ingredient name", async () => {
    const { items } = await readRecipeListFromMirror({ q: "vejce" });
    expect(items.map((i) => i.id)).toEqual(["r1"]);
  });

  it("finds by free-text ingredient", async () => {
    const { items } = await readRecipeListFromMirror({ q: "voda" });
    expect(items.map((i) => i.id)).toEqual(["r2"]);
  });

  it("returns nothing for a query that matches nothing", async () => {
    const { items } = await readRecipeListFromMirror({ q: "svickova" });
    expect(items).toEqual([]);
  });

  it("applies difficulty and time filters", async () => {
    expect(
      (await readRecipeListFromMirror({ difficulty: "medium" })).items.map(
        (i) => i.id,
      ),
    ).toEqual(["r2"]);
    expect(
      (await readRecipeListFromMirror({ maxTotalTime: 40 })).items.map(
        (i) => i.id,
      ),
    ).toEqual(["r2"]);
  });

  it("picks the main photo, not merely the first one", async () => {
    const { items } = await readRecipeListFromMirror({ q: "babovka" });
    expect(items[0].mainPhotoKey).toBe("b");
  });
});

describe("readRecipeFromMirror", () => {
  beforeEach(async () => {
    await seed({
      recipes: [
        { id: "r1", title: "Bábovka", baseServings: 12, deletedAt: null },
        { id: "r2", title: "Smazaný", deletedAt: "2026-08-04T10:00:00.000Z" },
      ],
      foods: [
        {
          id: "f1",
          name: "Skořice",
          foodCategoryId: "c2",
          referenceUnit: "100g",
          energyKj: 1000,
          divisiblePieces: false,
          deletedAt: null,
        },
        {
          id: "f2",
          name: "Mouka",
          foodCategoryId: "c3",
          referenceUnit: "100g",
          energyKj: 1400,
          divisiblePieces: false,
          deletedAt: null,
        },
      ],
      food_categories: [
        { id: "c1", name: "Koření", parentId: null, deletedAt: null },
        { id: "c2", name: "Sladké koření", parentId: "c1", deletedAt: null },
        { id: "c3", name: "Mouky", parentId: null, deletedAt: null },
      ],
      food_units: [
        {
          id: "u1",
          foodId: "f1",
          unit: "lzicka",
          gramsPerUnit: 2.5,
          deletedAt: null,
        },
      ],
      recipe_ingredients: [
        {
          id: "i2",
          recipeId: "r1",
          foodId: "f2",
          sortOrder: 2,
          amount: 600,
          unit: "g",
          deletedAt: null,
        },
        {
          id: "i1",
          recipeId: "r1",
          foodId: "f1",
          sortOrder: 1,
          amount: 1,
          unit: "lzicka",
          deletedAt: null,
        },
        {
          id: "i3",
          recipeId: "r1",
          freeText: "smazaná",
          sortOrder: 3,
          deletedAt: "2026-08-04T10:00:00.000Z",
        },
      ],
      recipe_steps: [
        {
          id: "s2",
          recipeId: "r1",
          sortOrder: 2,
          text: "Peč",
          deletedAt: null,
        },
        {
          id: "s1",
          recipeId: "r1",
          sortOrder: 1,
          text: "Smíchej",
          deletedAt: null,
        },
      ],
      recipe_photos: [
        {
          id: "p1",
          recipeId: "r1",
          storageKey: "a",
          isMain: true,
          sortOrder: 5,
          deletedAt: null,
        },
      ],
    });
  });

  it("returns null for an unknown or deleted recipe", async () => {
    expect(await readRecipeFromMirror("nope")).toBeNull();
    expect(await readRecipeFromMirror("r2")).toBeNull();
  });

  it("assembles the aggregate in sort order, without deleted children", async () => {
    const recipe = (await readRecipeFromMirror("r1"))!;
    const ingredients = recipe.ingredients as Record<string, unknown>[];
    expect(ingredients.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(
      (recipe.steps as Record<string, unknown>[]).map((s) => s.text),
    ).toEqual(["Smíchej", "Peč"]);
    expect(recipe.offline).toBe(true);
  });

  it("carries the food data the nutrition panel needs, including per-food units", async () => {
    const recipe = (await readRecipeFromMirror("r1"))!;
    const spice = (recipe.ingredients as Record<string, unknown>[])[0];
    const food = spice.food as Record<string, unknown>;
    expect(spice.foodName).toBe("Skořice");
    expect(food.energyKj).toBe(1000);
    expect(food.units).toEqual([{ unit: "lzicka", gramsPerUnit: 2.5 }]);
  });

  it("marks a food nested under Koření as a spice (server does this with the closure table)", async () => {
    const recipe = (await readRecipeFromMirror("r1"))!;
    const [spice, flour] = recipe.ingredients as Record<string, unknown>[];
    expect(spice.isSpice).toBe(true);
    expect(flour.isSpice).toBe(false);
  });

  it("switches off everything that would need the server", async () => {
    const recipe = (await readRecipeFromMirror("r1"))!;
    expect(recipe.permissions).toEqual({
      canEdit: false,
      canDelete: false,
      canShare: false,
    });
  });
});

describe("readTasksFromMirror", () => {
  it("resolves list and assignee names, ordered like the server", async () => {
    await seed({
      tasks: [
        {
          id: "t2",
          name: "Vysát",
          status: "done",
          taskListId: "l1",
          assigneeIds: ["u1"],
          completedBy: "u2",
          deletedAt: null,
        },
        {
          id: "t1",
          name: "Uklidit",
          status: "open",
          taskListId: "l1",
          assigneeIds: ["u1", "u9"],
          deletedAt: null,
        },
        {
          id: "t3",
          name: "Smazaný",
          status: "open",
          deletedAt: "2026-08-04T10:00:00.000Z",
        },
      ],
      task_lists: [{ id: "l1", name: "Úklid", deletedAt: null }],
    });
    const db = offlineDb();
    await db.meta.put({
      key: "cache:members",
      value: {
        items: [
          { userId: "u1", displayName: "Vojta" },
          { userId: "u2", displayName: "Eliška" },
        ],
      },
    });

    const { items } = await readTasksFromMirror();
    // Same order as the API: status ascending, so "done" sorts before "open"
    // (the screen groups them anyway).
    expect(items.map((t) => t.id)).toEqual(["t2", "t1"]);
    const open = items.find((t) => t.id === "t1")!;
    expect(open.taskListName).toBe("Úklid");
    expect(open.assignees).toEqual([
      { userId: "u1", displayName: "Vojta" },
      // Nobody invented a name for an unknown id.
      { userId: "u9", displayName: "člen domácnosti" },
    ]);
    expect(items.find((t) => t.id === "t2")!.completedByName).toBe("Eliška");
  });
});

describe("diary", () => {
  beforeEach(async () => {
    await seed({
      meal_types: [
        { id: "m1", name: "Snídaně", sortOrder: 1, deletedAt: null },
        { id: "m2", name: "Oběd", sortOrder: 2, deletedAt: null },
      ],
      nutrition_goals: [
        {
          id: "g1",
          nutrientKey: "energyKj",
          targetPerDay: 9000,
          deletedAt: null,
        },
      ],
      diary_entries: [
        {
          id: "d2",
          date: "2026-08-14",
          mealTypeId: "m2",
          title: "Bábovka",
          nutrition: { energyKj: 1141, proteinG: 5, incomplete: true },
          deletedAt: null,
        },
        {
          id: "d1",
          date: "2026-08-14",
          mealTypeId: "m1",
          title: "Kafe",
          nutrition: { energyKj: 250 },
          deletedAt: null,
        },
        {
          id: "d3",
          date: "2026-08-15",
          title: "Jablko",
          nutrition: { energyKj: 330, proteinG: 1 },
          deletedAt: null,
        },
        {
          id: "d4",
          date: "2026-08-14",
          title: "Smazané",
          nutrition: { energyKj: 5000 },
          deletedAt: "2026-08-14T12:00:00.000Z",
        },
      ],
    });
  });

  it("returns the range in meal order and skips deleted entries", async () => {
    const { items } = await readDiaryFromMirror("2026-08-14", "2026-08-14");
    expect(items.map((e) => e.id)).toEqual(["d1", "d2"]);
    expect(items[0].mealTypeName).toBe("Snídaně");
  });

  it("respects the range bounds", async () => {
    const { items } = await readDiaryFromMirror("2026-08-15", "2026-08-16");
    expect(items.map((e) => e.id)).toEqual(["d3"]);
  });

  it("sums snapshots per day and averages only days with entries", async () => {
    const summary = await readDiarySummaryFromMirror(
      "2026-08-10",
      "2026-08-16",
      NUTRIENTS,
    );
    const days = summary.days as {
      date: string;
      totals: Record<string, number>;
      incomplete: boolean;
    }[];
    expect(days.map((d) => d.date)).toEqual(["2026-08-14", "2026-08-15"]);
    expect(days[0].totals.energyKj).toBe(1391);
    // One incomplete entry makes the whole day incomplete.
    expect(days[0].incomplete).toBe(true);
    expect(days[1].incomplete).toBe(false);
    const averages = summary.averages as Record<string, number>;
    expect(averages.energyKj).toBe((1391 + 330) / 2);
    expect(summary.daysWithData).toBe(2);
    expect(summary.goals).toEqual([
      { nutrientKey: "energyKj", targetPerDay: 9000 },
    ]);
  });

  it("never turns a missing nutrient into a zero", async () => {
    const summary = await readDiarySummaryFromMirror(
      "2026-08-14",
      "2026-08-14",
      NUTRIENTS,
    );
    const days = summary.days as {
      totals: Record<string, number | undefined>;
    }[];
    // Only the cake carried protein; the coffee had none, so 5 and not 5 + 0.
    expect(days[0].totals.proteinG).toBe(5);
  });
});

describe("shopping", () => {
  beforeEach(async () => {
    await seed({
      shopping_lists: [
        {
          id: "sl1",
          name: "Sobotní nákup",
          periodStart: "2026-08-14",
          periodEnd: "2026-08-20",
          deletedAt: null,
        },
        {
          id: "sl0",
          name: "Smazaný",
          periodStart: "2026-08-01",
          deletedAt: "x",
        },
      ],
      shopping_items: [
        {
          id: "si1",
          shoppingListId: "sl1",
          foodId: "f1",
          amount: 3,
          unit: "ks",
          isChecked: false,
          storeSectionId: "ss1",
          deletedAt: null,
        },
        {
          id: "si2",
          shoppingListId: "sl1",
          freeText: "baterie",
          isChecked: true,
          deletedAt: null,
        },
        {
          id: "si3",
          shoppingListId: "sl1",
          freeText: "smazané",
          isChecked: false,
          deletedAt: "x",
        },
      ],
      foods: [{ id: "f1", name: "Máslo", deletedAt: null }],
      store_sections: [
        { id: "ss1", name: "Mléčné", sortOrder: 1, deletedAt: null },
      ],
    });
  });

  it("summarises the lists with live item counts", async () => {
    const { items } = await readShoppingListsFromMirror();
    expect(items.map((l) => l.id)).toEqual(["sl1"]);
    expect(items[0]).toMatchObject({ total: 2, checked: 1 });
  });

  it("gives every item the name the screen renders", async () => {
    const list = (await readShoppingListFromMirror("sl1"))!;
    expect(list.items.map((i) => i.name)).toEqual(["Máslo", "baterie"]);
    expect(list.items[0].storeSectionName).toBe("Mléčné");
    expect(list.offline).toBe(true);
  });

  it("returns null for a deleted list", async () => {
    expect(await readShoppingListFromMirror("sl0")).toBeNull();
  });
});
