import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { shoppingItems } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { shoppingItemPatchSchema } from "@/lib/schemas/shopping";

type Params = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const input = shoppingItemPatchSchema.parse(await req.json());
  const updated = await db
    .update(shoppingItems)
    .set({ ...input, lastModifiedBy: ctx.user.id })
    .where(
      and(
        eq(shoppingItems.id, id),
        eq(shoppingItems.householdId, ctx.householdId),
      ),
    )
    .returning({ id: shoppingItems.id });
  if (!updated.length) throw new ApiError("not_found", "Položka nenalezena.");
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    const updated = await db
      .update(shoppingItems)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(
        and(
          eq(shoppingItems.id, id),
          eq(shoppingItems.householdId, ctx.householdId),
        ),
      )
      .returning({ id: shoppingItems.id });
    if (!updated.length) throw new ApiError("not_found", "Položka nenalezena.");
    return NextResponse.json({ ok: true });
  },
);
