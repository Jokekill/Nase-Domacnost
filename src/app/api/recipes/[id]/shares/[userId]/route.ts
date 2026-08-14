import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { requireRecipeOwnership } from "@/lib/sharing/guards";
import { revokeShare } from "@/lib/sharing/service";

type Params = { params: Promise<{ id: string; userId: string }> };

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const p = await params;
    const recipeId = z.string().uuid().parse(p.id);
    const userId = z.string().uuid().parse(p.userId);
    await requireRecipeOwnership(ctx, recipeId);
    await revokeShare(
      { userId: ctx.user.id, householdId: ctx.householdId },
      recipeId,
      userId,
    );
    return NextResponse.json({ ok: true });
  },
);
