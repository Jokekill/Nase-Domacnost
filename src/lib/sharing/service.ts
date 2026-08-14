import { and, desc, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import {
  recipeCategories,
  recipeIngredientGroups,
  recipeIngredients,
  recipePhotos,
  recipePrepAhead,
  recipePublicLinks,
  recipeShares,
  recipeStepIngredients,
  recipeSteps,
  recipeTags,
  recipes,
  tags,
  users,
} from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { isPublicLinkUsable } from "@/lib/domain/recipe-access";
import { copyPhotoFiles } from "@/lib/photos/storage";
import { getRecipeAggregate } from "@/lib/recipes/service";
import type {
  PublicLinkCreate,
  RecipeCopy,
  ShareCreate,
} from "@/lib/schemas/sharing";

type Actor = { userId: string; householdId: string };

/* ------------------------------------------------------------------ */
/* Shares with specific users                                         */
/* ------------------------------------------------------------------ */

export async function listShares(recipeId: string) {
  const rows = await db
    .select({
      id: recipeShares.id,
      userId: recipeShares.userId,
      permission: recipeShares.permission,
      displayName: users.displayName,
      email: users.email,
      createdAt: recipeShares.createdAt,
    })
    .from(recipeShares)
    .innerJoin(users, eq(users.id, recipeShares.userId))
    .where(
      and(eq(recipeShares.recipeId, recipeId), isNull(recipeShares.deletedAt)),
    )
    .orderBy(desc(recipeShares.createdAt));
  return { items: rows };
}

export async function createShare(
  actor: Actor,
  recipe: typeof recipes.$inferSelect,
  input: ShareCreate,
) {
  const target = input.userId
    ? (
        await db
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1)
      )[0]
    : (
        await db
          .select()
          .from(users)
          .where(eq(users.email, input.email!))
          .limit(1)
      )[0];

  if (!target || target.deletedAt) {
    throw new ApiError(
      "not_found",
      "Takový uživatel tu není. Sdílet jde jen s někým, kdo už má účet.",
    );
  }
  if (target.id === recipe.ownerId) {
    throw new ApiError("validation_error", "Vlastníkovi recept sdílet nelze.");
  }

  // Re-sharing after a revoke reuses the row (the partial unique index only
  // covers live shares, so a plain insert would pile up dead rows).
  const [existing] = await db
    .select()
    .from(recipeShares)
    .where(
      and(
        eq(recipeShares.recipeId, recipe.id),
        eq(recipeShares.userId, target.id),
      ),
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(recipeShares)
      .set({
        permission: input.permission,
        deletedAt: null,
        lastModifiedBy: actor.userId,
      })
      .where(eq(recipeShares.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(recipeShares)
    .values({
      id: input.id ?? uuidv7(),
      // The share belongs to the recipe's household, not the actor's.
      householdId: recipe.householdId,
      recipeId: recipe.id,
      userId: target.id,
      permission: input.permission,
      lastModifiedBy: actor.userId,
    })
    .returning();
  return row;
}

export async function revokeShare(
  actor: Actor,
  recipeId: string,
  userId: string,
) {
  const updated = await db
    .update(recipeShares)
    .set({ deletedAt: new Date(), lastModifiedBy: actor.userId })
    .where(
      and(
        eq(recipeShares.recipeId, recipeId),
        eq(recipeShares.userId, userId),
        isNull(recipeShares.deletedAt),
      ),
    )
    .returning({ id: recipeShares.id });
  if (!updated.length) throw new ApiError("not_found", "Sdílení nenalezeno.");
}

/* ------------------------------------------------------------------ */
/* Public links                                                       */
/* ------------------------------------------------------------------ */

export async function listPublicLinks(recipeId: string) {
  const rows = await db
    .select({
      id: recipePublicLinks.id,
      isActive: recipePublicLinks.isActive,
      expiresAt: recipePublicLinks.expiresAt,
      createdAt: recipePublicLinks.createdAt,
      deletedAt: recipePublicLinks.deletedAt,
    })
    .from(recipePublicLinks)
    .where(
      and(
        eq(recipePublicLinks.recipeId, recipeId),
        isNull(recipePublicLinks.deletedAt),
      ),
    )
    .orderBy(desc(recipePublicLinks.createdAt));
  // The token itself is unrecoverable (only its hash is stored) — the URL is
  // shown exactly once, right after creation.
  return {
    items: rows.map((r) => ({
      id: r.id,
      isActive: r.isActive,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      usable: isPublicLinkUsable(r),
    })),
  };
}

export async function createPublicLink(
  actor: Actor,
  recipe: typeof recipes.$inferSelect,
  input: PublicLinkCreate,
) {
  const token = generateToken();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000)
    : null;

  const [row] = await db
    .insert(recipePublicLinks)
    .values({
      id: input.id ?? uuidv7(),
      householdId: recipe.householdId,
      recipeId: recipe.id,
      tokenHash: hashToken(token),
      expiresAt,
      lastModifiedBy: actor.userId,
    })
    .returning({
      id: recipePublicLinks.id,
      expiresAt: recipePublicLinks.expiresAt,
      isActive: recipePublicLinks.isActive,
      createdAt: recipePublicLinks.createdAt,
    });

  // Returned once and never again.
  return { ...row, token, url: `/share/${token}` };
}

export async function revokePublicLink(
  actor: Actor,
  recipeId: string,
  linkId: string,
) {
  const updated = await db
    .update(recipePublicLinks)
    .set({
      isActive: false,
      deletedAt: new Date(),
      lastModifiedBy: actor.userId,
    })
    .where(
      and(
        eq(recipePublicLinks.id, linkId),
        eq(recipePublicLinks.recipeId, recipeId),
        isNull(recipePublicLinks.deletedAt),
      ),
    )
    .returning({ id: recipePublicLinks.id });
  if (!updated.length) throw new ApiError("not_found", "Odkaz nenalezen.");
}

/* ------------------------------------------------------------------ */
/* Copying                                                            */
/* ------------------------------------------------------------------ */

/**
 * Deep-copies a recipe the actor may view into the actor's own household
 * (zadání §8.4). The copy is independent: its own rows, its own photo files,
 * `copied_from_recipe_id` kept only as provenance ("převzato od …").
 *
 * Cross-household details:
 *  - categories and tags are matched BY NAME in the target household, unknown
 *    tags are created, unknown categories are dropped (a category tree is a
 *    household's own structure — we do not graft foreign nodes into it),
 *  - `food_id` references stay as they are: foods are a shared catalogue and
 *    dropping them would silently destroy the nutrition data.
 */
export async function copyRecipe(
  actor: Actor,
  sourceId: string,
  input: RecipeCopy,
) {
  const source = await getRecipeAggregate(sourceId);
  const newRecipeId = input.id ?? uuidv7();

  // Idempotent replay of the same POST returns the existing copy.
  const [already] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.id, newRecipeId))
    .limit(1);
  if (already) return getRecipeAggregate(newRecipeId);

  const sameHousehold = source.householdId === actor.householdId;

  /* Photos are copied on disk first — a failed file copy must not leave a
     half-written recipe behind. */
  const photoCopies: {
    newId: string;
    oldId: string;
    storageKey: string;
    originalExt: string;
    width: number | null;
    height: number | null;
    sortOrder: number;
    isMain: boolean;
  }[] = [];
  if (input.withPhotos) {
    for (const photo of source.photos) {
      const storageKey = await copyPhotoFiles(
        photo.storageKey,
        photo.originalExt,
        actor.householdId,
      );
      photoCopies.push({
        newId: uuidv7(),
        oldId: photo.id,
        storageKey,
        originalExt: photo.originalExt,
        width: photo.width,
        height: photo.height,
        sortOrder: photo.sortOrder,
        isMain: photo.isMain,
      });
    }
  }

  const idMap = new Map<string, string>();
  const mapId = (old: string) => {
    const existing = idMap.get(old);
    if (existing) return existing;
    const fresh = uuidv7();
    idMap.set(old, fresh);
    return fresh;
  };

  const targetTagIds = await resolveTagsForHousehold(
    actor,
    source.tagIds,
    sameHousehold,
  );
  const targetCategoryIds = sameHousehold ? source.categoryIds : [];

  await db.transaction(async (tx) => {
    const common = {
      householdId: actor.householdId,
      recipeId: newRecipeId,
      lastModifiedBy: actor.userId,
    };

    await tx.insert(recipes).values({
      id: newRecipeId,
      householdId: actor.householdId,
      ownerId: actor.userId,
      title: input.title ?? source.title,
      intro: source.intro,
      baseServings: source.baseServings,
      prepTimeMin: source.prepTimeMin,
      cookTimeMin: source.cookTimeMin,
      difficulty: source.difficulty,
      source: source.source,
      notes: source.notes,
      // A copy starts private-ish: household visibility, never inheriting
      // the original's shares or public links.
      visibility: "household",
      copiedFromRecipeId: source.id,
      lastModifiedBy: actor.userId,
    });

    for (const g of source.groups) {
      await tx.insert(recipeIngredientGroups).values({
        ...common,
        id: mapId(g.id),
        name: g.name,
        sortOrder: g.sortOrder,
      });
    }

    for (const i of source.ingredients) {
      await tx.insert(recipeIngredients).values({
        ...common,
        id: mapId(i.id),
        groupId: i.groupId ? mapId(i.groupId) : null,
        foodId: i.foodId,
        freeText: i.freeText,
        amount: i.amount,
        unit: i.unit,
        note: i.note,
        isOptional: i.isOptional,
        sortOrder: i.sortOrder,
        nutritionOverride: i.nutritionOverride,
      });
    }

    for (const p of photoCopies) {
      await tx.insert(recipePhotos).values({
        ...common,
        id: p.newId,
        storageKey: p.storageKey,
        originalExt: p.originalExt,
        width: p.width,
        height: p.height,
        sortOrder: p.sortOrder,
        isMain: p.isMain,
      });
    }

    for (const s of source.steps) {
      const photoCopy = s.photoId
        ? photoCopies.find((p) => p.oldId === s.photoId)
        : undefined;
      await tx.insert(recipeSteps).values({
        ...common,
        id: mapId(s.id),
        text: s.text,
        sortOrder: s.sortOrder,
        photoId: photoCopy?.newId ?? null,
      });
      const links = s.ingredientIds
        .filter((iid) => idMap.has(iid))
        .map((iid) => ({ stepId: mapId(s.id), ingredientId: mapId(iid) }));
      if (links.length) await tx.insert(recipeStepIngredients).values(links);
    }

    if (targetCategoryIds.length) {
      await tx.insert(recipeCategories).values(
        targetCategoryIds.map((categoryId) => ({
          recipeId: newRecipeId,
          categoryId,
        })),
      );
    }
    if (targetTagIds.length) {
      await tx
        .insert(recipeTags)
        .values(targetTagIds.map((tagId) => ({ recipeId: newRecipeId, tagId })));
    }

    if (source.prepAhead) {
      await tx.insert(recipePrepAhead).values({
        ...common,
        id: uuidv7(),
        leadTimeHours: source.prepAhead.leadTimeHours,
        description: source.prepAhead.description,
      });
    }
  });

  return getRecipeAggregate(newRecipeId);
}

/** Same household → same tag rows; foreign household → match/create by name. */
async function resolveTagsForHousehold(
  actor: Actor,
  sourceTagIds: string[],
  sameHousehold: boolean,
): Promise<string[]> {
  if (sameHousehold || sourceTagIds.length === 0) return sourceTagIds;

  const result: string[] = [];
  for (const tagId of sourceTagIds) {
    const [src] = await db
      .select({ name: tags.name })
      .from(tags)
      .where(eq(tags.id, tagId))
      .limit(1);
    if (!src) continue;
    const [existing] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.householdId, actor.householdId),
          eq(tags.name, src.name),
          isNull(tags.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      result.push(existing.id);
      continue;
    }
    const [created] = await db
      .insert(tags)
      .values({
        id: uuidv7(),
        householdId: actor.householdId,
        name: src.name,
        lastModifiedBy: actor.userId,
      })
      .returning({ id: tags.id });
    result.push(created.id);
  }
  return result;
}
