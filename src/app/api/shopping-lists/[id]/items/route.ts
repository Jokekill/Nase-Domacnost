import { and, eq, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { shoppingItems, shoppingLists } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { shoppingItemCreateSchema } from "@/lib/schemas/shopping";

type Params = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const listId = z.string().uuid().parse((await params).id);
  const input = shoppingItemCreateSchema.parse(await req.json());

  const [list] = await db
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.id, listId),
        eq(shoppingLists.householdId, ctx.householdId),
        isNull(shoppingLists.deletedAt),
      ),
    )
    .limit(1);
  if (!list) throw new ApiError("not_found", "Seznam nenalezen.");

  // Manual items go to the end of the list.
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(sort_order), -1)::int` })
    .from(shoppingItems)
    .where(eq(shoppingItems.shoppingListId, listId));

  await db
    .insert(shoppingItems)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      shoppingListId: listId,
      foodId: input.foodId ?? null,
      freeText: input.freeText ?? null,
      amount: input.amount ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
      storeSectionId: input.storeSectionId ?? null,
      sortOrder: maxOrder + 1,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoNothing();

  return NextResponse.json({ id: input.id }, { status: 201 });
});
