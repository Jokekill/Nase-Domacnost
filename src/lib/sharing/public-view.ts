import { getRecipeAggregate } from "@/lib/recipes/service";
import { UNIT_LABELS, type Unit } from "@/lib/recipes/types";

export type PublicRecipe = Awaited<ReturnType<typeof buildPublicRecipe>>;

/**
 * Projection of a recipe for anonymous visitors holding a public link.
 *
 * Whitelist, not blacklist: everything that is not explicitly listed here
 * stays inside the household — no ids, no owner/household references, no
 * nutrition (that is the household's food catalogue, not part of the recipe).
 */
export async function buildPublicRecipe(recipeId: string) {
  const r = await getRecipeAggregate(recipeId);

  const groupName = new Map(r.groups.map((g) => [g.id, g.name]));

  return {
    title: r.title,
    intro: r.intro,
    baseServings: r.baseServings,
    prepTimeMin: r.prepTimeMin,
    cookTimeMin: r.cookTimeMin,
    totalTimeMin: r.totalTimeMin,
    difficulty: r.difficulty,
    source: r.source,
    notes: r.notes,
    ownerName: r.ownerName,
    prepAhead: r.prepAhead
      ? {
          leadTimeHours: r.prepAhead.leadTimeHours,
          description: r.prepAhead.description,
        }
      : null,
    photoKeys: r.photos.map((p) => p.storageKey),
    ingredients: r.ingredients.map((i) => ({
      group: i.groupId ? (groupName.get(i.groupId) ?? null) : null,
      name: i.foodName ?? i.freeText ?? "",
      amount: i.amount,
      unit: i.unit ? (UNIT_LABELS[i.unit as Unit] ?? i.unit) : null,
      note: i.note,
      isOptional: i.isOptional,
    })),
    steps: r.steps.map((s) => ({ text: s.text })),
  };
}
