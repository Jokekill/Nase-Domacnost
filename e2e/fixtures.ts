import type { APIRequestContext } from "@playwright/test";

/**
 * Data the smoke tests need, created through the API if they are not there yet.
 *
 * `pnpm db:seed` makes the household, the users and the catalogue, but no
 * recipe and no shopping list — so on a fresh database (CI) the suite would be
 * testing empty screens. Everything here is idempotent: on a development
 * database that already has these, nothing is created.
 */

const RECIPE_TITLE = "Babiččina bábovka";
const LIST_NAME = "Sobotní nákup";

const id = () => crypto.randomUUID();

export async function ensureFixtures(api: APIRequestContext): Promise<void> {
  await ensureRecipe(api);
  await ensureShoppingList(api);
}

/** Looks up a catalogue food by name so the recipe has real nutrition data. */
async function findFoodId(
  api: APIRequestContext,
  name: string,
): Promise<string | null> {
  const found = await api
    .get(`/api/foods?q=${encodeURIComponent(name)}`)
    .then((r) => r.json());
  return found.items?.[0]?.id ?? null;
}

async function ensureRecipe(api: APIRequestContext): Promise<void> {
  const found = await api
    .get(`/api/recipes?limit=5&q=${encodeURIComponent("babovka")}`)
    .then((r) => r.json());
  if (
    (found.items ?? []).some((r: { title: string }) => /bábovka/i.test(r.title))
  ) {
    return;
  }

  // Linked to the catalogue where possible: with free text only, the recipe
  // has no nutrition to show and the detail screen says so instead.
  const ingredients = await Promise.all(
    [
      { name: "Pšeničná mouka hladká", amount: 600 },
      { name: "Cukr krupice", amount: 400 },
      { name: "Máslo", amount: 300 },
    ].map(async (item, index) => {
      const foodId = await findFoodId(api, item.name);
      return {
        id: id(),
        foodId,
        freeText: foodId ? null : item.name,
        amount: item.amount,
        unit: "g",
        isOptional: false,
        sortOrder: index,
      };
    }),
  );

  const response = await api.post("/api/recipes", {
    data: {
      id: id(),
      title: RECIPE_TITLE,
      intro: "Nedělní klasika pro testy.",
      baseServings: 12,
      prepTimeMin: 15,
      cookTimeMin: 60,
      difficulty: "easy",
      visibility: "household",
      ingredients,
      steps: [{ id: id(), text: "Vše smíchej a peč.", sortOrder: 0 }],
    },
  });
  if (!response.ok()) {
    throw new Error(`Recept se nepodařilo založit: ${await response.text()}`);
  }
}

/** Returns the id of a shopping list, creating one when there is none. */
async function ensureShoppingList(api: APIRequestContext): Promise<string> {
  const lists = await api.get("/api/shopping-lists").then((r) => r.json());
  let listId: string | undefined = lists.items?.[0]?.id;

  if (!listId) {
    listId = id();
    const today = new Date();
    const end = new Date(today.getTime() + 6 * 24 * 3600_000);
    const day = (date: Date) => date.toISOString().slice(0, 10);
    const response = await api.post("/api/shopping-lists", {
      data: {
        id: listId,
        name: LIST_NAME,
        periodStart: day(today),
        periodEnd: day(end),
      },
    });
    if (!response.ok()) {
      throw new Error(`Seznam se nepodařilo založit: ${await response.text()}`);
    }
  }

  return listId;
}

/**
 * A shopping item of its own for the ticking test, with a name nothing else
 * shares. Ticking goes through the outbox, so a test that reused whatever the
 * previous run left behind would depend on that run's queue having drained
 * before its browser closed — it does not.
 */
export async function createShoppingItem(
  api: APIRequestContext,
): Promise<{ listId: string; itemId: string; name: string }> {
  const listId = await ensureShoppingList(api);
  const itemId = id();
  const name = `Máslo ${itemId.slice(0, 8)}`;

  const response = await api.post(`/api/shopping-lists/${listId}/items`, {
    data: { id: itemId, freeText: name, amount: 3, unit: "ks" },
  });
  if (!response.ok()) {
    throw new Error(`Položku se nepodařilo přidat: ${await response.text()}`);
  }
  return { listId, itemId, name };
}

export async function deleteShoppingItem(
  api: APIRequestContext,
  itemId: string,
): Promise<void> {
  await api.delete(`/api/shopping-items/${itemId}`);
}

/** A chapter of its own to play with, so a test never touches a real one. */
export async function createChapter(
  api: APIRequestContext,
): Promise<{ id: string; name: string }> {
  const chapterId = id();
  const name = `Kapitola ${chapterId.slice(0, 8)}`;
  const response = await api.post("/api/categories", {
    data: { id: chapterId, name, parentId: null, sortOrder: 999 },
  });
  if (!response.ok()) {
    throw new Error(`Kapitolu se nepodařilo založit: ${await response.text()}`);
  }
  return { id: chapterId, name };
}

export async function deleteChapter(
  api: APIRequestContext,
  chapterId: string,
): Promise<void> {
  await api.delete(`/api/categories/${chapterId}`);
}
