import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { mealPlanEntries } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { refreshPrepSuggestions } from "@/lib/planning/meal-plan";
import { requireRecipeAccess } from "@/lib/recipes/access";
import { mealPlanEntrySchema } from "@/lib/schemas/planning";

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = mealPlanEntrySchema.parse(await req.json());
  if (input.recipeId) {
    await requireRecipeAccess(ctx.user, input.recipeId, "view");
  }

  await db
    .insert(mealPlanEntries)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      date: input.date,
      mealTypeId: input.mealTypeId,
      sortOrder: input.sortOrder,
      recipeId: input.recipeId ?? null,
      freeText: input.freeText ?? null,
      servings: input.servings ?? null,
      preparedBy: input.preparedBy ?? null,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoNothing();

  await refreshPrepSuggestions(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input.id,
  );
  return NextResponse.json({ id: input.id }, { status: 201 });
});
