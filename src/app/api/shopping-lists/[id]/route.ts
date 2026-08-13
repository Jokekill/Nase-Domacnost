import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { shoppingLists } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { getShoppingList } from "@/lib/shopping/service";

type Params = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  return NextResponse.json(await getShoppingList(ctx.householdId, id));
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    const updated = await db
      .update(shoppingLists)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(
        and(
          eq(shoppingLists.id, id),
          eq(shoppingLists.householdId, ctx.householdId),
        ),
      )
      .returning({ id: shoppingLists.id });
    if (!updated.length) throw new ApiError("not_found", "Seznam nenalezen.");
    return NextResponse.json({ ok: true });
  },
);
