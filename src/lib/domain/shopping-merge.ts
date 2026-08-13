/**
 * Shopping list merging (zadání §6.5).
 *
 * Rules:
 *  - merge by `foodId`, never by name text,
 *  - merge across units only where the conversion is unambiguous
 *    (g↔kg, ml↔l, and anything convertible via the food's own data),
 *  - otherwise keep the amounts separate ("800 g mouky" + "2 lžíce mouky"),
 *  - every merged line keeps the list of sources it came from.
 */

import { toGrams, toMillilitres, type ConversionFood } from "./units";

export type MergeSource = {
  recipeId?: string | null;
  mealPlanEntryId?: string | null;
  /** Human label shown in the "where is this from" popover. */
  label: string;
  amount: number | null;
  unit: string | null;
};

export type MergeInput = {
  foodId: string | null;
  /** Display name; also the merge key for free-text items. */
  name: string;
  amount: number | null;
  unit: string | null;
  note?: string | null;
  food?: (ConversionFood & { referenceUnit?: string | null }) | null;
  source: MergeSource;
  /**
   * Sources already recorded for this quantity (re-import of an existing
   * list line). They travel with the line so attribution is never lost.
   */
  carriedSources?: MergeSource[];
};

export type MergedItem = {
  foodId: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  sources: MergeSource[];
};

/** Units that always convert within their family. */
const MASS_UNITS = new Set(["g", "kg"]);
const VOLUME_UNITS = new Set(["ml", "l"]);
const UNCOUNTABLE = new Set(["spetka", "dle_chuti"]);

type Bucket =
  | { kind: "mass"; grams: number }
  | { kind: "volume"; millilitres: number }
  | { kind: "raw"; unit: string | null; amount: number | null };

function bucketFor(item: MergeInput): Bucket | null {
  const { amount, unit, food } = item;
  if (unit && UNCOUNTABLE.has(unit)) return { kind: "raw", unit, amount };
  if (amount == null || unit == null) return { kind: "raw", unit, amount };

  if (MASS_UNITS.has(unit)) {
    const grams = toGrams(amount, unit, food ?? null);
    if (grams.ok) return { kind: "mass", grams: grams.value };
  }
  if (VOLUME_UNITS.has(unit)) {
    const ml = toMillilitres(amount, unit, food ?? null);
    if (ml.ok) return { kind: "volume", millilitres: ml.value };
  }
  // ks / lžíce / lžička: only merge with the same unit — converting them to
  // grams would hide what the user actually needs to buy.
  return { kind: "raw", unit, amount };
}

function bucketKey(bucket: Bucket): string {
  if (bucket.kind === "mass") return "mass";
  if (bucket.kind === "volume") return "volume";
  return `raw:${bucket.unit ?? "none"}`;
}

/** Prefers the friendlier unit: 1200 g → 1.2 kg, 1500 ml → 1.5 l. */
function humanizeMass(grams: number): { amount: number; unit: string } {
  if (grams >= 1000) {
    return { amount: Number((grams / 1000).toFixed(3)), unit: "kg" };
  }
  return { amount: Number(grams.toFixed(2)), unit: "g" };
}

function humanizeVolume(millilitres: number): { amount: number; unit: string } {
  if (millilitres >= 1000) {
    return { amount: Number((millilitres / 1000).toFixed(3)), unit: "l" };
  }
  return { amount: Number(millilitres.toFixed(2)), unit: "ml" };
}

export function mergeShoppingItems(items: MergeInput[]): MergedItem[] {
  // group key: food id (or normalized free text) + convertibility bucket
  const groups = new Map<
    string,
    {
      foodId: string | null;
      name: string;
      note: string | null;
      bucket: Bucket;
      sources: MergeSource[];
    }
  >();

  for (const item of items) {
    const bucket = bucketFor(item);
    if (!bucket) continue;
    const identity =
      item.foodId ?? `text:${item.name.trim().toLocaleLowerCase("cs")}`;
    const key = `${identity}|${bucketKey(bucket)}`;
    const existing = groups.get(key);

    const incomingSources = item.carriedSources?.length
      ? item.carriedSources
      : [item.source];

    if (!existing) {
      groups.set(key, {
        foodId: item.foodId,
        name: item.name,
        note: item.note ?? null,
        bucket,
        sources: [...incomingSources],
      });
      continue;
    }

    existing.sources.push(...incomingSources);
    if (existing.bucket.kind === "mass" && bucket.kind === "mass") {
      existing.bucket = {
        kind: "mass",
        grams: existing.bucket.grams + bucket.grams,
      };
    } else if (existing.bucket.kind === "volume" && bucket.kind === "volume") {
      existing.bucket = {
        kind: "volume",
        millilitres: existing.bucket.millilitres + bucket.millilitres,
      };
    } else if (existing.bucket.kind === "raw" && bucket.kind === "raw") {
      const total =
        existing.bucket.amount == null && bucket.amount == null
          ? null
          : (existing.bucket.amount ?? 0) + (bucket.amount ?? 0);
      existing.bucket = { kind: "raw", unit: existing.bucket.unit, amount: total };
    }
    // Notes differ between sources — keep the first, the rest stay visible
    // through the source list.
  }

  return [...groups.values()].map((group) => {
    if (group.bucket.kind === "mass") {
      const { amount, unit } = humanizeMass(group.bucket.grams);
      return { ...group, amount, unit, sources: group.sources };
    }
    if (group.bucket.kind === "volume") {
      const { amount, unit } = humanizeVolume(group.bucket.millilitres);
      return { ...group, amount, unit, sources: group.sources };
    }
    return {
      foodId: group.foodId,
      name: group.name,
      note: group.note,
      amount: group.bucket.amount,
      unit: group.bucket.unit,
      sources: group.sources,
    };
  });
}
