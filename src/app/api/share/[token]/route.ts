import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { publicSharingEnabled, recipeIdForPublicToken } from "@/lib/recipes/access";
import { buildPublicRecipe } from "@/lib/sharing/public-view";

type Params = { params: Promise<{ token: string }> };

/**
 * The only endpoint in the app that answers without a session (§8.5).
 * Returns a whitelisted projection — never household data.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  if (!publicSharingEnabled()) {
    throw new ApiError("not_found", "Odkaz neplatí.");
  }
  const token = z.string().min(10).max(200).parse((await params).token);
  const recipeId = await recipeIdForPublicToken(token);
  if (!recipeId) {
    // Expired, revoked or simply wrong — the visitor learns nothing more.
    throw new ApiError("not_found", "Odkaz neplatí nebo už vypršel.");
  }
  const recipe = await buildPublicRecipe(recipeId);
  return NextResponse.json(recipe, {
    headers: { "Cache-Control": "no-store" },
  });
});
