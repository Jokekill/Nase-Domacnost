import { and, eq, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { db } from "@/db/client";
import { recipePhotos } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guards";
import { saveRecipePhoto } from "@/lib/photos/storage";
import { requireRecipeAccess } from "@/lib/recipes/access";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const user = await requireUser();
  const recipeId = z.string().uuid().parse((await params).id);
  const recipe = await requireRecipeAccess(user, recipeId, "edit");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("validation_error", "Chybí soubor (pole `file`).");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("validation_error", "Fotka je větší než 25 MB.");
  }
  const clientId = form.get("id");
  const photoId =
    typeof clientId === "string" && clientId
      ? z.string().uuid().parse(clientId)
      : uuidv7();

  // Idempotent replay: same photo id → return the existing record.
  const existing = await db
    .select()
    .from(recipePhotos)
    .where(eq(recipePhotos.id, photoId))
    .limit(1);
  if (existing[0]) return NextResponse.json(existing[0]);

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await saveRecipePhoto(recipe.householdId, buffer);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipePhotos)
    .where(
      and(eq(recipePhotos.recipeId, recipeId), isNull(recipePhotos.deletedAt)),
    );

  const [photo] = await db
    .insert(recipePhotos)
    .values({
      id: photoId,
      householdId: recipe.householdId,
      recipeId,
      storageKey: stored.storageKey,
      originalExt: stored.originalExt,
      width: stored.width,
      height: stored.height,
      sortOrder: count,
      isMain: count === 0, // first photo becomes the main one
      lastModifiedBy: user.id,
    })
    .returning();

  return NextResponse.json(photo, { status: 201 });
});
