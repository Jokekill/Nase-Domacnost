import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { recipes } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import type { HouseholdContext } from "@/lib/auth/guards";

/**
 * Managing WHO a recipe is shared with is stricter than editing it: only the
 * owner or an admin of the recipe's household may hand out access. Someone
 * with an `edit` share must not be able to re-share what is not theirs.
 */
export async function requireRecipeOwnership(
  ctx: HouseholdContext,
  recipeId: string,
): Promise<typeof recipes.$inferSelect> {
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  if (!recipe) throw new ApiError("not_found", "Recept nenalezen.");

  const isOwner = recipe.ownerId === ctx.user.id;
  const isHouseholdAdmin =
    ctx.role === "admin" && recipe.householdId === ctx.householdId;
  if (!isOwner && !isHouseholdAdmin) {
    // Do not confirm the recipe exists to people who cannot see it at all.
    if (recipe.householdId !== ctx.householdId || recipe.visibility === "private") {
      throw new ApiError("not_found", "Recept nenalezen.");
    }
    throw new ApiError(
      "forbidden",
      "Sdílení může nastavovat jen vlastník receptu nebo správce domácnosti.",
    );
  }
  return recipe;
}
