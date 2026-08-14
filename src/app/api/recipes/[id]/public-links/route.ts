import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { publicSharingEnabled } from "@/lib/recipes/access";
import { publicLinkCreateSchema } from "@/lib/schemas/sharing";
import { requireRecipeOwnership } from "@/lib/sharing/guards";
import { createPublicLink, listPublicLinks } from "@/lib/sharing/service";

type Params = { params: Promise<{ id: string }> };

function requireFlag() {
  if (!publicSharingEnabled()) {
    throw new ApiError(
      "forbidden",
      "Veřejné odkazy jsou v této instalaci vypnuté (PUBLIC_SHARING_ENABLED).",
    );
  }
}

export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  requireFlag();
  const ctx = await requireHousehold();
  const recipeId = z.string().uuid().parse((await params).id);
  await requireRecipeOwnership(ctx, recipeId);
  return NextResponse.json(await listPublicLinks(recipeId));
});

export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  requireFlag();
  const ctx = await requireHousehold();
  const recipeId = z.string().uuid().parse((await params).id);
  const recipe = await requireRecipeOwnership(ctx, recipeId);
  const body = await req.json().catch(() => ({}));
  const input = publicLinkCreateSchema.parse(body ?? {});
  const link = await createPublicLink(
    { userId: ctx.user.id, householdId: ctx.householdId },
    recipe,
    input,
  );
  return NextResponse.json(link, { status: 201 });
});
