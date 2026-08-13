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
    })
    .from(categories)
    .where(
      and(eq(categories.householdId, householdId), isNull(categories.deletedAt)),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/**
 * Closure-table maintenance (docs/DECISIONS.md D-005). All tree mutations run
 * in a single transaction with the node change.
 */
export async function createCategory(
  actor: Actor,
  input: { id: string; name: string; parentId?: string | null; sortOrder: number },
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
  input: { name?: string; parentId?: string | null; sortOrder?: number },
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
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
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
      .where(
        inArray(categoryClosure.descendantId, [id]),
      );
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
