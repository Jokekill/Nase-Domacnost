import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guards";
import { requireRecipeAccess } from "@/lib/recipes/access";
import {
  getRecipeAggregate,
  softDeleteRecipe,
  upsertRecipe,
} from "@/lib/recipes/service";
import { recipeUpsertSchema } from "@/lib/schemas/recipes";

type Params = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const id = z.string().uuid().parse((await params).id);
  await requireRecipeAccess(user, id, "view");
  return NextResponse.json(await getRecipeAggregate(id));
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const id = z.string().uuid().parse((await params).id);
  const recipe = await requireRecipeAccess(user, id, "edit");
  const input = recipeUpsertSchema.parse({ ...(await req.json()), id });
  const updated = await upsertRecipe(
    { userId: user.id, householdId: recipe.householdId },
    input,
    { isNew: false },
  );
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const user = await requireUser();
    const id = z.string().uuid().parse((await params).id);
    const recipe = await requireRecipeAccess(user, id, "delete");
    await softDeleteRecipe(
      { userId: user.id, householdId: recipe.householdId },
      id,
    );
    return NextResponse.json({ ok: true });
  },
);
