import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, categoryClosure } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";

type Actor = { userId: string; householdId: string };

export async function listCategoryTree(householdId: string) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      isHidden: categories.isHidden,
    })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        isNull(categories.deletedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export type CookbookChapter = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isHidden: boolean;
  /** Recipes in this category INCLUDING its subcategories. */
  recipeCount: number;
  /** Main photo of the newest recipe in the chapter, for the tile. */
  coverPhotoKey: string | null;
};

/**
 * The cookbook's front page: chapters with how much is in them (§5.1).
 *
 * Counts go through the closure table, so "Hlavní jídla" counts everything
 * under it, and they obey the same visibility rules as the recipe list — a
 * private recipe of someone else is not even counted.
 */
export async function getCookbookOverview(actor: Actor): Promise<{
  chapters: CookbookChapter[];
  totalRecipes: number;
  uncategorisedRecipes: number;
}> {
  const visible = sql`
    SELECT r.id, r.created_at,
           (SELECT rp.storage_key FROM recipe_photos rp
             WHERE rp.recipe_id = r.id AND rp.deleted_at IS NULL
             ORDER BY rp.is_main DESC, rp.sort_order ASC LIMIT 1) AS photo
    FROM recipes r
    WHERE r.deleted_at IS NULL
      AND (
        (r.household_id = ${actor.householdId}
          AND (r.visibility <> 'private' OR r.owner_id = ${actor.userId}))
        OR EXISTS (
          SELECT 1 FROM recipe_shares rs
          WHERE rs.recipe_id = r.id AND rs.user_id = ${actor.userId}
            AND rs.deleted_at IS NULL
        )
      )
  `;

  const rows = (await db.execute(sql`
    WITH visible AS (${visible}),
    per_cat AS (
      SELECT cc.ancestor_id AS category_id, v.id AS recipe_id,
             v.created_at, v.photo
      FROM recipe_categories rc
      JOIN visible v ON v.id = rc.recipe_id
      JOIN category_closure cc ON cc.descendant_id = rc.category_id
    )
    SELECT c.id, c.name, c.parent_id, c.sort_order, c.is_hidden,
           (SELECT count(DISTINCT p.recipe_id)
              FROM per_cat p WHERE p.category_id = c.id)::int AS recipe_count,
           (SELECT p.photo FROM per_cat p
              WHERE p.category_id = c.id AND p.photo IS NOT NULL
              ORDER BY p.created_at DESC LIMIT 1) AS cover_photo_key
    FROM categories c
    WHERE c.household_id = ${actor.householdId} AND c.deleted_at IS NULL
    ORDER BY c.sort_order, c.name
  `)) as unknown as Record<string, unknown>[];

  const [totals] = (await db.execute(sql`
    WITH visible AS (${visible})
    SELECT count(*)::int AS total,
           count(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM recipe_categories rc WHERE rc.recipe_id = visible.id
             )
           )::int AS uncategorised
    FROM visible
  `)) as unknown as Record<string, unknown>[];

  return {
    chapters: rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      parentId: (row.parent_id as string | null) ?? null,
      sortOrder: Number(row.sort_order ?? 0),
      isHidden: Boolean(row.is_hidden),
      recipeCount: Number(row.recipe_count ?? 0),
      coverPhotoKey: (row.cover_photo_key as string | null) ?? null,
    })),
    totalRecipes: Number(totals?.total ?? 0),
    uncategorisedRecipes: Number(totals?.uncategorised ?? 0),
  };
}

/**
 * Writes a whole new order in one go. The screen sends the chapters as they
 * ended up after the arrows, so one failed request cannot leave half an order
 * behind.
 */
export async function reorderCategories(
  actor: Actor,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  if (items.length === 0) return;
  await db.transaction(async (tx) => {
    for (const item of items) {
      await assertNodeInHousehold(tx, item.id, actor.householdId);
      await tx
        .update(categories)
        .set({ sortOrder: item.sortOrder, lastModifiedBy: actor.userId })
        .where(eq(categories.id, item.id));
    }
  });
}

/**
 * Closure-table maintenance (docs/DECISIONS.md D-005). All tree mutations run
 * in a single transaction with the node change.
 */
export async function createCategory(
  actor: Actor,
  input: {
    id: string;
    name: string;
    parentId?: string | null;
    sortOrder: number;
  },
) {
  await db.transaction(async (tx) => {
    if (input.parentId) {
      await assertNodeInHousehold(tx, input.parentId, actor.householdId);
    }
    await tx.insert(categories).values({
      id: input.id,
      householdId: actor.householdId,
      name: input.name,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      lastModifiedBy: actor.userId,
    });
    // Self-link + inherited ancestor links
    await tx
      .insert(categoryClosure)
      .values({ ancestorId: input.id, descendantId: input.id, depth: 0 });
    if (input.parentId) {
      await tx.execute(sql`
        INSERT INTO category_closure (ancestor_id, descendant_id, depth)
        SELECT ancestor_id, ${input.id}, depth + 1
        FROM category_closure WHERE descendant_id = ${input.parentId}
      `);
    }
  });
}

export async function updateCategory(
  actor: Actor,
  id: string,
  input: {
    name?: string;
    parentId?: string | null;
    sortOrder?: number;
    isHidden?: boolean;
  },
) {
  await db.transaction(async (tx) => {
    const node = await assertNodeInHousehold(tx, id, actor.householdId);

    if (input.parentId !== undefined && input.parentId !== node.parentId) {
      if (input.parentId) {
        await assertNodeInHousehold(tx, input.parentId, actor.householdId);
        // Reject moving under own descendant (would create a cycle).
        const cycle = await tx
          .select({ d: categoryClosure.depth })
          .from(categoryClosure)
          .where(
            and(
              eq(categoryClosure.ancestorId, id),
              eq(categoryClosure.descendantId, input.parentId),
            ),
          )
          .limit(1);
        if (cycle.length) {
          throw new ApiError(
            "conflict",
            "Kategorii nelze přesunout pod její vlastní podkategorii.",
          );
        }
      }
      // Detach subtree from old ancestors...
      await tx.execute(sql`
        DELETE FROM category_closure
        WHERE descendant_id IN (
          SELECT descendant_id FROM category_closure WHERE ancestor_id = ${id}
        )
        AND ancestor_id NOT IN (
          SELECT descendant_id FROM category_closure WHERE ancestor_id = ${id}
        )
      `);
      // ...and attach it under the new parent.
      if (input.parentId) {
        await tx.execute(sql`
          INSERT INTO category_closure (ancestor_id, descendant_id, depth)
          SELECT super.ancestor_id, sub.descendant_id,
                 super.depth + sub.depth + 1
          FROM category_closure super
          JOIN category_closure sub ON sub.ancestor_id = ${id}
          WHERE super.descendant_id = ${input.parentId}
        `);
      }
    }

    await tx
      .update(categories)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        ...(input.isHidden !== undefined ? { isHidden: input.isHidden } : {}),
        lastModifiedBy: actor.userId,
      })
      .where(eq(categories.id, id));
  });
}

export async function deleteCategory(actor: Actor, id: string) {
  await db.transaction(async (tx) => {
    await assertNodeInHousehold(tx, id, actor.householdId);
    const children = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, id), isNull(categories.deletedAt)))
      .limit(1);
    if (children.length) {
      throw new ApiError(
        "conflict",
        "Kategorie má podkategorie — nejdřív je přesuň nebo smaž.",
      );
    }
    const used = await tx.execute(sql`
      SELECT 1 FROM recipe_categories WHERE category_id = ${id} LIMIT 1
    `);
    if (used.length) {
      throw new ApiError(
        "conflict",
        "Kategorii používají recepty — nejdřív je přeřaď.",
      );
    }
    await tx
      .update(categories)
      .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
      .where(eq(categories.id, id));
    await tx
      .delete(categoryClosure)
      .where(inArray(categoryClosure.descendantId, [id]));
    await tx.delete(categoryClosure).where(eq(categoryClosure.ancestorId, id));
  });
}

async function assertNodeInHousehold(
  tx: Pick<typeof db, "select">,
  id: string,
  householdId: string,
) {
  const rows = await tx
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.householdId, householdId),
        isNull(categories.deletedAt),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new ApiError("not_found", "Kategorie nenalezena.");
  return rows[0];
}
