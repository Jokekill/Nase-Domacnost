/**
 * Recipe permission matrix (docs/ARCHITECTURE.md §2.2) as a pure function.
 *
 * The DB lookups live in src/lib/recipes/access.ts; the decision itself is
 * here so it can be tested exhaustively without a database. Rules:
 *
 *  - the owner may do anything,
 *  - `private` is invisible to everyone else (reported as not_found, so a
 *    stranger cannot even confirm the recipe exists),
 *  - members of the recipe's household may view and edit a non-private
 *    recipe; only the owner or an admin may delete it,
 *  - shares WIDEN access, they never narrow it — the best of all applicable
 *    grants wins,
 *  - a public link is read-only for everybody, and never grants edit/delete.
 */

export type RecipeAccessMode = "view" | "edit" | "delete";

export type AccessSubject = {
  /** null for an anonymous visitor holding a public link. */
  userId: string | null;
  /** Role in the RECIPE's household, null when the user is not a member. */
  membershipRole: "admin" | "member" | null;
  /** Permission from a live recipe_shares row, if any. */
  sharePermission: "view" | "edit" | null;
  /** True when a valid, active, unexpired public link token was supplied. */
  hasValidPublicToken: boolean;
};

export type RecipeFacts = {
  ownerId: string;
  visibility: "private" | "household" | "shared";
};

export type AccessDecision =
  | { allowed: true; via: "owner" | "household" | "share" | "public_link" }
  | { allowed: false; reason: "not_found" | "forbidden"; message: string };

export function decideRecipeAccess(
  recipe: RecipeFacts,
  subject: AccessSubject,
  mode: RecipeAccessMode,
): AccessDecision {
  if (subject.userId && subject.userId === recipe.ownerId) {
    return { allowed: true, via: "owner" };
  }

  if (subject.sharePermission === "edit") {
    // Explicit edit share covers view+edit, but deleting someone else's
    // recipe stays with the owner.
    if (mode === "delete") {
      return {
        allowed: false,
        reason: "forbidden",
        message: "Smazat recept může jen vlastník nebo správce domácnosti.",
      };
    }
    return { allowed: true, via: "share" };
  }

  const isHouseholdMember = subject.membershipRole !== null;
  if (isHouseholdMember && recipe.visibility !== "private") {
    if (mode === "delete" && subject.membershipRole !== "admin") {
      return {
        allowed: false,
        reason: "forbidden",
        message: "Smazat recept může jen vlastník nebo správce domácnosti.",
      };
    }
    return { allowed: true, via: "household" };
  }

  if (subject.sharePermission === "view") {
    if (mode === "view") return { allowed: true, via: "share" };
    return {
      allowed: false,
      reason: "forbidden",
      message: "Recept máš jen ke čtení.",
    };
  }

  if (subject.hasValidPublicToken) {
    if (mode === "view") return { allowed: true, via: "public_link" };
    return {
      allowed: false,
      reason: "forbidden",
      message: "Veřejný odkaz je jen ke čtení.",
    };
  }

  // Nothing applies: never leak whether the recipe exists.
  return { allowed: false, reason: "not_found", message: "Recept nenalezen." };
}

/** A public link only works while it is active and not past its expiry. */
export function isPublicLinkUsable(
  link: { isActive: boolean; expiresAt: Date | null; deletedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (link.deletedAt) return false;
  if (!link.isActive) return false;
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
