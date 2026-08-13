import { and, eq, isNull, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { recipePhotos } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guards";
import { requireRecipeAccess } from "@/lib/recipes/access";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  sortOrder: z.number().int().optional(),
  isMain: z.boolean().optional(),
});

async function loadPhoto(id: string) {
  const [photo] = await db
    .select()
    .from(recipePhotos)
    .where(and(eq(recipePhotos.id, id), isNull(recipePhotos.deletedAt)))
    .limit(1);
  if (!photo) throw new ApiError("not_found", "Fotka nenalezena.");
  return photo;
}

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const id = z.string().uuid().parse((await params).id);
  const photo = await loadPhoto(id);
  await requireRecipeAccess(user, photo.recipeId, "edit");
  const input = patchSchema.parse(await req.json());

  await db.transaction(async (tx) => {
    if (input.isMain) {
      // Single main photo per recipe (partial unique index).
      await tx
        .update(recipePhotos)
        .set({ isMain: false, lastModifiedBy: user.id })
        .where(
          and(
            eq(recipePhotos.recipeId, photo.recipeId),
            ne(recipePhotos.id, id),
            eq(recipePhotos.isMain, true),
          ),
        );
    }
    await tx
      .update(recipePhotos)
      .set({
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isMain !== undefined ? { isMain: input.isMain } : {}),
        lastModifiedBy: user.id,
      })
      .where(eq(recipePhotos.id, id));
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const user = await requireUser();
    const id = z.string().uuid().parse((await params).id);
    const photo = await loadPhoto(id);
    await requireRecipeAccess(user, photo.recipeId, "edit");
    // Soft delete only — files stay on disk for sync/undo; real cleanup can
    // be added to the maintenance cron later.
    await db
      .update(recipePhotos)
      .set({ deletedAt: new Date(), isMain: false, lastModifiedBy: user.id })
      .where(eq(recipePhotos.id, id));
    return NextResponse.json({ ok: true });
  },
);
