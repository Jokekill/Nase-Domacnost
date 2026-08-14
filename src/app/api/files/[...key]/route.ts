import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { recipePhotos } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { photoFilePath, type PhotoVariant } from "@/lib/photos/storage";
import { resolveRecipeAccess } from "@/lib/recipes/access";

const variantSchema = z.enum(["thumb", "card", "full", "orig"]).default("card");

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
  heif: "image/heic",
};

export const GET = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) => {
    const storageKey = (await params).key.join("/");
    const variant: PhotoVariant = variantSchema.parse(
      req.nextUrl.searchParams.get("v") ?? undefined,
    );
    // A public-link visitor has no session; the token in `?share=` is then the
    // only thing that can authorize the file (§8.5).
    const shareToken = req.nextUrl.searchParams.get("share");
    const user = shareToken ? await getSessionUser() : await requireUser();

    // Authorization: the storage key must belong to a photo of a recipe the
    // user may view (docs/ARCHITECTURE.md §3.3).
    const [photo] = await db
      .select()
      .from(recipePhotos)
      .where(
        and(
          eq(recipePhotos.storageKey, storageKey),
          isNull(recipePhotos.deletedAt),
        ),
      )
      .limit(1);
    if (!photo) throw new ApiError("not_found", "Soubor nenalezen.");
    await resolveRecipeAccess(
      { user, publicToken: shareToken },
      photo.recipeId,
      "view",
    );

    const filePath = photoFilePath(storageKey, variant, photo.originalExt);
    let size: number;
    try {
      size = (await stat(filePath)).size;
    } catch {
      throw new ApiError("not_found", "Soubor nenalezen.");
    }

    const ext = variant === "orig" ? photo.originalExt : "webp";
    const stream = Readable.toWeb(
      createReadStream(filePath),
    ) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Length": String(size),
        // Immutable: the key contains a UUID and content never changes.
        // Public-link visitors get a short window instead, so revoking a link
        // actually stops working for them within minutes.
        "Cache-Control": shareToken
          ? "private, max-age=300"
          : "private, max-age=31536000, immutable",
      },
    });
  },
);
