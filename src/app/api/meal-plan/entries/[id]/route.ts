import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { mealPlanEntries } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { refreshPrepSuggestions } from "@/lib/planning/meal-plan";
import { mealPlanEntryPatchSchema } from "@/lib/schemas/planning";

type Params = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const input = mealPlanEntryPatchSchema.parse(await req.json());

  const updated = await db
    .update(mealPlanEntries)
    .set({ ...input, lastModifiedBy: ctx.user.id })
    .where(
      and(
        eq(mealPlanEntries.id, id),
        eq(mealPlanEntries.householdId, ctx.householdId),
        isNull(mealPlanEntries.deletedAt),
      ),
    )
    .returning({ id: mealPlanEntries.id });
  if (!updated.length) throw new ApiError("not_found", "Položka nenalezena.");

  if (input.recipeId !== undefined || input.date !== undefined) {
    await refreshPrepSuggestions(
      { userId: ctx.user.id, householdId: ctx.householdId },
      id,
    );
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    const updated = await db
      .update(mealPlanEntries)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(
        and(
          eq(mealPlanEntries.id, id),
          eq(mealPlanEntries.householdId, ctx.householdId),
        ),
      )
      .returning({ id: mealPlanEntries.id });
    if (!updated.length) throw new ApiError("not_found", "Položka nenalezena.");
    return NextResponse.json({ ok: true });
  },
);
