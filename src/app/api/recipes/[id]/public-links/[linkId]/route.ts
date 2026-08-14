import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { requireRecipeOwnership } from "@/lib/sharing/guards";
import { revokePublicLink } from "@/lib/sharing/service";

type Params = { params: Promise<{ id: string; linkId: string }> };

/**
 * Revoking works even when the feature flag is off — turning sharing off must
 * never trap an already-published link.
 */
export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const p = await params;
    const recipeId = z.string().uuid().parse(p.id);
    const linkId = z.string().uuid().parse(p.linkId);
    await requireRecipeOwnership(ctx, recipeId);
    await revokePublicLink(
      { userId: ctx.user.id, householdId: ctx.householdId },
      recipeId,
      linkId,
    );
    return NextResponse.json({ ok: true });
  },
);
