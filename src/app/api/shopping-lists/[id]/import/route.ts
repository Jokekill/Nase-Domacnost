import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { requireRecipeAccess } from "@/lib/recipes/access";
import { importIntoListSchema } from "@/lib/schemas/shopping";
import {
  importMealPlanIntoList,
  importRecipeIntoList,
} from "@/lib/shopping/service";

type Params = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const listId = z.string().uuid().parse((await params).id);
  const input = importIntoListSchema.parse(await req.json());
  const actor = { userId: ctx.user.id, householdId: ctx.householdId };

  // A recipe id from the request is never trusted: importing it must go
  // through the recipe permission matrix (docs/ARCHITECTURE.md §2.2).
  if ("recipeId" in input) {
    await requireRecipeAccess(ctx.user, input.recipeId, "view");
  }

  const result =
    "recipeId" in input
      ? await importRecipeIntoList(
          actor,
          listId,
          input.recipeId,
          input.servings,
        )
      : await importMealPlanIntoList(
          actor,
          listId,
          input.mealPlanFrom,
          input.mealPlanTo,
        );

  return NextResponse.json(result, { status: 201 });
});
