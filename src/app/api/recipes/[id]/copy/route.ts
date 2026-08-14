import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { requireRecipeAccess } from "@/lib/recipes/access";
import { recipeCopySchema } from "@/lib/schemas/sharing";
import { copyRecipe } from "@/lib/sharing/service";

type Params = { params: Promise<{ id: string }> };

/** Copying needs `view` on the source and a household to copy into (§8.4). */
export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const sourceId = z.string().uuid().parse((await params).id);
  await requireRecipeAccess(ctx.user, sourceId, "view");

  const body = await req.json().catch(() => ({}));
  const input = recipeCopySchema.parse(body ?? {});
  const copy = await copyRecipe(
    { userId: ctx.user.id, householdId: ctx.householdId },
    sourceId,
    input,
  );
  return NextResponse.json(copy, { status: 201 });
});
