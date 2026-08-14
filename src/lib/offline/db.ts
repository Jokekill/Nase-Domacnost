"use client";

import Dexie, { type EntityTable } from "dexie";

/**
 * Local mirror + outbox (docs/SYNC.md §1, §5).
 *
 * The mirror is a dumb copy of what the server sent — no business logic lives
 * here. Rows keep their server shape (camelCase, ISO strings) so the same code
 * can render them online and offline.
 */
export type MirrorRow = { id: string; [key: string]: unknown };

export type OutboxOp = {
  opId: string;
  entity: string;
  entityId: string;
  op: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  clientTs: string;
  state: "pending" | "sending" | "failed";
  error?: string;
};

export type DiscardedChange = {
  id?: number;
  at: string;
  entity: string;
  entityId: string;
  fields: string[];
  reason?: string;
};

export type MetaRow = { key: string; value: unknown };

/** Tables mirrored locally — must stay in step with src/lib/sync/registry.ts. */
export const MIRROR_TABLES = [
  "recipes",
  "recipe_photos",
  "recipe_ingredient_groups",
  "recipe_ingredients",
  "recipe_steps",
  "recipe_prep_ahead",
  "categories",
  "tags",
  "foods",
  "food_units",
  "food_categories",
  "store_sections",
  "meal_types",
  "meal_plan_entries",
  "task_lists",
  "shopping_lists",
  "shopping_items",
  "tasks",
  "diary_entries",
  "nutrition_goals",
] as const;

export type MirrorTable = (typeof MIRROR_TABLES)[number];

class OfflineDb extends Dexie {
  outbox!: EntityTable<OutboxOp, "opId">;
  meta!: EntityTable<MetaRow, "key">;
  discarded!: EntityTable<DiscardedChange, "id">;

  constructor() {
    super("nase-domacnost");
    const stores: Record<string, string> = {
      outbox: "opId, state, clientTs",
      meta: "key",
      discarded: "++id, at",
    };
    // Mirror tables are indexed by id plus the couple of columns the screens
    // actually filter on.
    for (const table of MIRROR_TABLES) stores[table] = "id, householdId";
    stores.shopping_items = "id, shoppingListId, isChecked";
    stores.recipe_ingredients = "id, recipeId";
    stores.recipe_steps = "id, recipeId";
    stores.recipe_photos = "id, recipeId";
    stores.recipe_ingredient_groups = "id, recipeId";
    stores.recipe_prep_ahead = "id, recipeId";
    stores.tasks = "id, status, dueDate";
    stores.diary_entries = "id, date";
    this.version(1).stores(stores);
  }

  mirror(table: MirrorTable): EntityTable<MirrorRow, "id"> {
    return this.table(table) as EntityTable<MirrorRow, "id">;
  }
}

let instance: OfflineDb | null = null;

/** Lazily created: IndexedDB does not exist during server rendering. */
export function offlineDb(): OfflineDb {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB není k dispozici (běží tohle na serveru?).");
  }
  instance ??= new OfflineDb();
  return instance;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await offlineDb().meta.get(key);
  return (row?.value as T) ?? fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await offlineDb().meta.put({ key, value });
}
