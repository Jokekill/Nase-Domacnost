import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { householdMembers, recipes } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth/session";

export type RecipeAccessMode = "view" | "edit" | "delete";
export type RecipeRow = typeof recipes.$inferSelect;

/**
 * Recipe permission matrix (docs/ARCHITECTURE.md §2.2). Recipe access is
 * independent of household data access — a user may see a recipe without
 * being a member of its household (recipe_shares, Phase 8).
 */
export async function requireRecipeAccess(
  user: SessionUser,
  recipeId: string,
  mode: RecipeAccessMode,
): Promise<RecipeRow> {
  const rows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  const recipe = rows[0];
  if (!recipe) throw new ApiError("not_found", "Recept nenalezen.");

  if (recipe.ownerId === user.id) return recipe;

  if (recipe.visibility === "private") {
    throw new ApiError("not_found", "Recept nenalezen.");
  }

  // household / shared: household members of the recipe's household
  const membership = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, user.id),
        eq(householdMembers.householdId, recipe.householdId),
      ),
    )
    .limit(1);

  if (membership[0]) {
    if (mode === "delete" && membership[0].role !== "admin") {
      throw new ApiError(
        "forbidden",
        "Recept může smazat jen vlastník nebo správce.",
      );
    }
    return recipe;
  }

  // recipe_shares comes in Phase 8; until then no external access.
  throw new ApiError("not_found", "Recept nenalezen.");
}
