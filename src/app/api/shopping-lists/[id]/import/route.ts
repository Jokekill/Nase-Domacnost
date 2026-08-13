import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
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
