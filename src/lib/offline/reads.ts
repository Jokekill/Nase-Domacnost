"use client";

import { offlineDb } from "./db";

/**
 * Offline reads from the mirror (docs/SYNC.md §6, priority 1–2).
 *
 * Shapes match the online endpoints so screens can fall back without knowing
 * where the data came from. Only what the shop scenario needs is filled in;
 * fields the mirror cannot know (who ticked it, recipe sources) come back
 * empty rather than invented.
 */
export type OfflineShoppingList = {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  items: {
    id: string;
    freeText: string | null;
    foodName: string | null;
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

export async function readShoppingListFromMirror(
  listId: string,
): Promise<OfflineShoppingList | null> {
  const db = offlineDb();
  const list = await db.mirror("shopping_lists").get(listId);
  if (!list || list.deletedAt) return null;

  const [items, foods, sections] = await Promise.all([
    db.mirror("shopping_items").where("shoppingListId").equals(listId).toArray(),
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
          freeText: (item.freeText as string) ?? null,
          foodName: item.foodId ? (foodName.get(item.foodId as string) ?? null) : null,
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
          (a.foodName ?? a.freeText ?? "").localeCompare(
            b.foodName ?? b.freeText ?? "",
            "cs",
          ),
      ),
  };
}
