import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { uuidv7 } from "uuidv7";
import { ApiError } from "@/lib/api/errors";

/** /data/uploads in Docker; ./data/uploads during development. */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "data", "uploads");
}

const VARIANTS = [
  { name: "thumb", width: 400 },
  { name: "card", width: 800 },
  { name: "full", width: 1600 },
] as const;
export type PhotoVariant = (typeof VARIANTS)[number]["name"] | "orig";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export type StoredPhoto = {
  storageKey: string;
  originalExt: string;
  width: number | null;
  height: number | null;
};

/**
 * Validates by decoding (magic bytes, not extension), honours EXIF orientation,
 * strips metadata, writes 3 WebP variants + the original
 * (docs/ARCHITECTURE.md §3.2).
 */
export async function saveRecipePhoto(
  householdId: string,
  buffer: Buffer,
): Promise<StoredPhoto> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ApiError("validation_error", "Soubor není platný obrázek.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new ApiError(
      "validation_error",
      "Podporované formáty fotek: JPEG, PNG, WebP, HEIC.",
    );
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const id = uuidv7();
  const storageKey = `${householdId}/${yyyy}/${mm}/${id}`;
  const dir = path.join(uploadsDir(), householdId, yyyy, mm);
  await mkdir(dir, { recursive: true });

  const originalExt = meta.format === "jpeg" ? "jpg" : meta.format;
  // .rotate() applies EXIF orientation; output carries no metadata (EXIF wiped).
  const oriented = sharp(buffer).rotate();
  const orientedMeta = await oriented.clone().toBuffer({ resolveWithObject: true });

  const written: string[] = [];
  try {
    const origPath = path.join(dir, `${id}_orig.${originalExt}`);
    await writeFile(origPath, buffer);
    written.push(origPath);

    for (const variant of VARIANTS) {
      const outPath = path.join(dir, `${id}_${variant.name}.webp`);
      await sharp(buffer)
        .rotate()
        .resize({ width: variant.width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outPath);
      written.push(outPath);
    }
  } catch (err) {
    // Clean up partial writes so no orphan files remain.
    await Promise.allSettled(written.map((p) => rm(p, { force: true })));
    throw err;
  }

  return {
    storageKey,
    originalExt,
    width: orientedMeta.info.width ?? null,
    height: orientedMeta.info.height ?? null,
  };
}

export function photoFilePath(
  storageKey: string,
  variant: PhotoVariant,
  originalExt: string,
): string {
  const safe = storageKey.replace(/\.\./g, "");
  const suffix = variant === "orig" ? `_orig.${originalExt}` : `_${variant}.webp`;
  return path.join(uploadsDir(), ...safe.split("/")) + suffix;
}

/**
 * Physically duplicates all variants of a photo into the target household's
 * folder — a copied recipe must not depend on the original's files, which its
 * owner may delete at any time (docs/ARCHITECTURE.md §2.2).
 */
export async function copyPhotoFiles(
  sourceKey: string,
  originalExt: string,
  targetHouseholdId: string,
): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const id = uuidv7();
  const dir = path.join(uploadsDir(), targetHouseholdId, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const targetKey = `${targetHouseholdId}/${yyyy}/${mm}/${id}`;

  const variants: PhotoVariant[] = ["orig", "thumb", "card", "full"];
  const written: string[] = [];
  try {
    for (const variant of variants) {
      const from = photoFilePath(sourceKey, variant, originalExt);
      const to = photoFilePath(targetKey, variant, originalExt);
      try {
        await copyFile(from, to);
        written.push(to);
      } catch (err) {
        // A missing variant is survivable (older upload, interrupted write);
        // a missing original is not.
        if (variant === "orig") throw err;
      }
    }
  } catch (err) {
    await Promise.allSettled(written.map((p) => rm(p, { force: true })));
    throw err;
  }
  return targetKey;
}

export async function deletePhotoFiles(
  storageKey: string,
  originalExt: string,
): Promise<void> {
  const variants: PhotoVariant[] = ["orig", "thumb", "card", "full"];
  await Promise.allSettled(
    variants.map((v) =>
      rm(photoFilePath(storageKey, v, originalExt), { force: true }),
    ),
  );
}
