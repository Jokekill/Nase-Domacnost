import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  householdMembers,
  recipePublicLinks,
  recipeShares,
  recipes,
} from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";
import {
  decideRecipeAccess,
  isPublicLinkUsable,
  type AccessSubject,
  type RecipeAccessMode,
} from "@/lib/domain/recipe-access";

export type { RecipeAccessMode };
export type RecipeRow = typeof recipes.$inferSelect;

export function publicSharingEnabled(): boolean {
  return process.env.PUBLIC_SHARING_ENABLED === "true";
}

type Visitor = {
  user?: SessionUser | null;
  /** Raw token from a /share/<token> URL, if the request carries one. */
  publicToken?: string | null;
};

/**
 * Recipe permission matrix (docs/ARCHITECTURE.md §2.2). Recipe access is
 * independent of household data access — a user may see a recipe without
 * being a member of its household, and a recipe grant never opens any
 * household endpoint (those go through requireHousehold).
 *
 * The decision itself is the pure `decideRecipeAccess`; this function only
 * gathers the facts it needs.
 */
export async function resolveRecipeAccess(
  visitor: Visitor,
  recipeId: string,
  mode: RecipeAccessMode,
): Promise<RecipeRow> {
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
    .limit(1);
  if (!recipe) throw new ApiError("not_found", "Recept nenalezen.");

  const userId = visitor.user?.id ?? null;

  const [membership, share, publicOk] = await Promise.all([
    userId
      ? db
          .select({ role: householdMembers.role })
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.userId, userId),
              eq(householdMembers.householdId, recipe.householdId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    userId
      ? db
          .select({ permission: recipeShares.permission })
          .from(recipeShares)
          .where(
            and(
              eq(recipeShares.recipeId, recipeId),
              eq(recipeShares.userId, userId),
              isNull(recipeShares.deletedAt),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    hasUsablePublicLink(recipeId, visitor.publicToken),
  ]);

  const subject: AccessSubject = {
    userId,
    membershipRole: membership[0]?.role ?? null,
    sharePermission: share[0]?.permission ?? null,
    hasValidPublicToken: publicOk,
  };

  const decision = decideRecipeAccess(recipe, subject, mode);
  if (!decision.allowed) {
    throw new ApiError(decision.reason, decision.message);
  }
  return recipe;
}

/**
 * What the user may do with a recipe, in one round of lookups — so the UI can
 * hide what the API would refuse anyway (the API stays the real gate).
 */
export async function getRecipePermissions(
  user: SessionUser,
  recipe: RecipeRow,
): Promise<{ canEdit: boolean; canDelete: boolean; canShare: boolean }> {
  const [membership, share] = await Promise.all([
    db
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.userId, user.id),
          eq(householdMembers.householdId, recipe.householdId),
        ),
      )
      .limit(1),
    db
      .select({ permission: recipeShares.permission })
      .from(recipeShares)
      .where(
        and(
          eq(recipeShares.recipeId, recipe.id),
          eq(recipeShares.userId, user.id),
          isNull(recipeShares.deletedAt),
        ),
      )
      .limit(1),
  ]);

  const subject: AccessSubject = {
    userId: user.id,
    membershipRole: membership[0]?.role ?? null,
    sharePermission: share[0]?.permission ?? null,
    hasValidPublicToken: false,
  };

  return {
    canEdit: decideRecipeAccess(recipe, subject, "edit").allowed,
    canDelete: decideRecipeAccess(recipe, subject, "delete").allowed,
    // Handing out access is owner/admin only (src/lib/sharing/guards.ts).
    canShare:
      recipe.ownerId === user.id || subject.membershipRole === "admin",
  };
}

/** Back-compat wrapper for the many call sites that only have a session user. */
export function requireRecipeAccess(
  user: SessionUser,
  recipeId: string,
  mode: RecipeAccessMode,
): Promise<RecipeRow> {
  return resolveRecipeAccess({ user }, recipeId, mode);
}

async function hasUsablePublicLink(
  recipeId: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (!token || !publicSharingEnabled()) return false;
  const [link] = await db
    .select()
    .from(recipePublicLinks)
    .where(eq(recipePublicLinks.tokenHash, hashToken(token)))
    .limit(1);
  if (!link || link.recipeId !== recipeId) return false;
  return isPublicLinkUsable(link);
}

/** Resolves a public token to its recipe, or null when it does not grant one. */
export async function recipeIdForPublicToken(
  token: string,
): Promise<string | null> {
  if (!publicSharingEnabled()) return null;
  const [link] = await db
    .select()
    .from(recipePublicLinks)
    .where(eq(recipePublicLinks.tokenHash, hashToken(token)))
    .limit(1);
  if (!link || !isPublicLinkUsable(link)) return null;
  return link.recipeId;
}
