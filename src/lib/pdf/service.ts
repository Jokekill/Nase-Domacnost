import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { photoFilePath } from "@/lib/photos/storage";
import { getRecipeAggregate } from "@/lib/recipes/service";
import type { PdfRecipe } from "./cookbook";

/**
 * Turns recipe aggregates into the flat shape the PDF renderer wants.
 * Photos: react-pdf only understands JPEG/PNG, our variants are WebP —
 * so the card variant is transcoded on the fly (sharp is already a dep).
 */
export async function loadRecipesForPdf(
  recipeIds: string[],
): Promise<PdfRecipe[]> {
  const out: PdfRecipe[] = [];
  for (const id of recipeIds) {
    const r = await getRecipeAggregate(id);
    const groupName = new Map(r.groups.map((g) => [g.id, g.name]));

    out.push({
      id: r.id,
      title: r.title,
      intro: r.intro,
      baseServings: r.baseServings,
      totalTimeMin: r.totalTimeMin,
      difficulty: r.difficulty,
      notes: r.notes,
      source: r.source,
      prepAhead: r.prepAhead
        ? {
            leadTimeHours: r.prepAhead.leadTimeHours,
            description: r.prepAhead.description,
          }
        : null,
      ingredients: r.ingredients.map((i) => ({
        groupName: i.groupId ? (groupName.get(i.groupId) ?? null) : null,
        name: i.foodName ?? i.freeText ?? "",
        amount: i.amount,
        unit: i.unit,
        note: i.note,
        isOptional: i.isOptional,
      })),
      steps: r.steps.map((s) => s.text),
      photo: await loadPhotoJpeg(r.photos[0] ?? null),
    });
  }
  return out;
}

async function loadPhotoJpeg(
  photo: { storageKey: string; originalExt: string } | null,
): Promise<Buffer | null> {
  if (!photo) return null;
  try {
    const webp = await readFile(
      photoFilePath(photo.storageKey, "card", photo.originalExt),
    );
    return await sharp(webp).jpeg({ quality: 82 }).toBuffer();
  } catch {
    // A missing file must not fail the whole cookbook.
    return null;
  }
}
