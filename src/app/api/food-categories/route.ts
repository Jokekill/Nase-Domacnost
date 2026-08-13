import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { foodCategories, foodCategoryClosure } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { categoryUpsertSchema } from "@/lib/schemas/recipes";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await db
    .select({
      id: foodCategories.id,
      name: foodCategories.name,
      parentId: foodCategories.parentId,
      sortOrder: foodCategories.sortOrder,
    })
    .from(foodCategories)
    .where(
      and(
        eq(foodCategories.householdId, ctx.householdId),
        isNull(foodCategories.deletedAt),
      ),
    )
    .orderBy(asc(foodCategories.sortOrder), asc(foodCategories.name));
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = categoryUpsertSchema.parse(await req.json());

  await db.transaction(async (tx) => {
    if (input.parentId) {
      const parent = await tx
        .select({ id: foodCategories.id })
        .from(foodCategories)
        .where(
          and(
            eq(foodCategories.id, input.parentId),
            eq(foodCategories.householdId, ctx.householdId),
            isNull(foodCategories.deletedAt),
          ),
        )
        .limit(1);
      if (!parent[0]) {
        throw new ApiError("not_found", "Nadřazená skupina nenalezena.");
      }
    }
    await tx.insert(foodCategories).values({
      id: input.id,
      householdId: ctx.householdId,
      name: input.name,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      lastModifiedBy: ctx.user.id,
    });
    await tx.insert(foodCategoryClosure).values({
      ancestorId: input.id,
      descendantId: input.id,
      depth: 0,
    });
    if (input.parentId) {
      await tx.execute(sql`
        INSERT INTO food_category_closure (ancestor_id, descendant_id, depth)
        SELECT ancestor_id, ${input.id}, depth + 1
        FROM food_category_closure WHERE descendant_id = ${input.parentId}
      `);
    }
  });
  return NextResponse.json({ id: input.id }, { status: 201 });
});
