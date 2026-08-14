import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { requireRecipeOwnership } from "@/lib/sharing/guards";
import { shareCreateSchema } from "@/lib/schemas/sharing";
import { createShare, listShares } from "@/lib/sharing/service";

type Params = { params: Promise<{ id: string }> };

/** Who a recipe is shared with — visible to whoever may manage the sharing. */
export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const recipeId = z.string().uuid().parse((await params).id);
  await requireRecipeOwnership(ctx, recipeId);
  return NextResponse.json(await listShares(recipeId));
});

export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const recipeId = z.string().uuid().parse((await params).id);
  const recipe = await requireRecipeOwnership(ctx, recipeId);
  const input = shareCreateSchema.parse(await req.json());
  const share = await createShare(
    { userId: ctx.user.id, householdId: ctx.householdId },
    recipe,
    input,
  );
  return NextResponse.json(share, { status: 201 });
});
