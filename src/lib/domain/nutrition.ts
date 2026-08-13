/**
 * Nutrition calculation (zadání §6.3).
 *
 * Honesty rules that must never be broken:
 *  - an ingredient that cannot be converted or has no data is NOT counted,
 *    and the result is flagged `incomplete` with the reason,
 *  - missing values are never treated as zero,
 *  - per-recipe `nutritionOverride` replaces the food's values for this recipe
 *    only, and is reported so the UI can mark it.
 */

import {
  toGrams,
  toMillilitres,
  toPieces,
  type ConversionFood,
  type MissingReason,
} from "./units";

export const NUTRIENT_KEYS = [
  "energyKj",
  "proteinG",
  "carbsG",
  "sugarsG",
  "fiberG",
  "fatG",
  "satFatG",
  "saltG",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energyKj: "Energie",
  proteinG: "Bílkoviny",
  carbsG: "Sacharidy",
  sugarsG: "z toho cukry",
  fiberG: "Vláknina",
  fatG: "Tuky",
  satFatG: "z toho nasycené",
  saltG: "Sůl",
};

export const NUTRIENT_UNITS: Record<NutrientKey, string> = {
  energyKj: "kJ",
  proteinG: "g",
  carbsG: "g",
  sugarsG: "g",
  fiberG: "g",
  fatG: "g",
  satFatG: "g",
  saltG: "g",
};

/** 1 kcal = 4.184 kJ (zadání §6.3; kJ is the stored and preferred unit). */
export const KJ_PER_KCAL = 4.184;
export const kjToKcal = (kj: number): number => kj / KJ_PER_KCAL;

export type NutritionValues = Partial<Record<NutrientKey, number | null>>;

export type NutritionFood = ConversionFood & {
  /** '100g' | '100ml' | 'piece' */
  referenceUnit: string;
} & NutritionValues;

export type NutritionIngredient = {
  id: string;
  amount: number | null;
  unit: string | null;
  isOptional?: boolean;
  /** Per-reference-unit override valid only inside this recipe (§5.3). */
  nutritionOverride?: NutritionValues | null;
  food?: NutritionFood | null;
  /** Display name, used in "what is missing" messages. */
  label?: string;
};

export type IngredientNutrition = {
  ingredientId: string;
  label: string;
  /** null when the ingredient could not be counted. */
  values: NutritionValues | null;
  counted: boolean;
  reason?: MissingReason | "no_nutrition_data";
  /** Nutrients taken from nutritionOverride rather than the food. */
  overriddenKeys: NutrientKey[];
};

export type RecipeNutrition = {
  /** Totals for the whole recipe at its base servings. */
  total: NutritionValues;
  /** total / baseServings — stays constant when servings are scaled. */
  perServing: NutritionValues;
  /** True when at least one ingredient could not be counted. */
  incomplete: boolean;
  /** Human-readable list for the UI, e.g. ["2 ks vejce — chybí hmotnost kusu"]. */
  missing: { label: string; reason: string }[];
  /** Whether optional ingredients were included in the totals. */
  includesOptional: boolean;
  perIngredient: IngredientNutrition[];
};

/** How many "reference units" (100 g / 100 ml / 1 piece) the amount represents. */
function referenceFactor(
  ingredient: NutritionIngredient,
  food: NutritionFood,
): { ok: true; value: number } | { ok: false; reason: MissingReason } {
  switch (food.referenceUnit) {
    case "100ml": {
      const ml = toMillilitres(ingredient.amount, ingredient.unit, food);
      return ml.ok ? { ok: true, value: ml.value / 100 } : ml;
    }
    case "piece": {
      const pieces = toPieces(ingredient.amount, ingredient.unit, food);
      return pieces.ok ? { ok: true, value: pieces.value } : pieces;
    }
    case "100g":
    default: {
      const grams = toGrams(ingredient.amount, ingredient.unit, food);
      return grams.ok ? { ok: true, value: grams.value / 100 } : grams;
    }
  }
}

export function computeIngredientNutrition(
  ingredient: NutritionIngredient,
): IngredientNutrition {
  const label = ingredient.label ?? "ingredience";
  const food = ingredient.food;
  const override = ingredient.nutritionOverride ?? null;

  if (!food) {
    return {
      ingredientId: ingredient.id,
      label,
      values: null,
      counted: false,
      reason: "no_food",
      overriddenKeys: [],
    };
  }

  const factor = referenceFactor(ingredient, food);
  if (!factor.ok) {
    return {
      ingredientId: ingredient.id,
      label,
      values: null,
      counted: false,
      reason: factor.reason,
      overriddenKeys: [],
    };
  }

  const values: NutritionValues = {};
  const overriddenKeys: NutrientKey[] = [];
  let hasAnyValue = false;

  for (const key of NUTRIENT_KEYS) {
    const overrideValue = override?.[key];
    const base =
      overrideValue != null ? overrideValue : (food[key] ?? null);
    if (overrideValue != null) overriddenKeys.push(key);
    if (base == null) {
      values[key] = null; // missing stays missing — never 0
      continue;
    }
    values[key] = base * factor.value;
    hasAnyValue = true;
  }

  if (!hasAnyValue) {
    return {
      ingredientId: ingredient.id,
      label,
      values: null,
      counted: false,
      reason: "no_nutrition_data",
      overriddenKeys,
    };
  }

  return {
    ingredientId: ingredient.id,
    label,
    values,
    counted: true,
    overriddenKeys,
  };
}

const REASON_TEXT: Record<MissingReason | "no_nutrition_data", string> = {
  no_amount: "chybí množství",
  not_quantifiable: "množství nelze vyčíslit",
  no_food: "není propojeno s potravinou",
  no_density: "chybí hustota potraviny",
  no_grams_per_piece: "chybí hmotnost kusu",
  no_food_unit: "chybí převod lžíce/lžičky",
  unknown_unit: "neznámá jednotka",
  no_nutrition_data: "potravina nemá nutriční hodnoty",
};

export function computeRecipeNutrition(
  ingredients: NutritionIngredient[],
  baseServings: number,
): RecipeNutrition {
  const perIngredient = ingredients.map(computeIngredientNutrition);

  const total: NutritionValues = {};
  const missing: { label: string; reason: string }[] = [];
  let includesOptional = false;

  for (const key of NUTRIENT_KEYS) {
    let sum: number | null = null;
    for (const item of perIngredient) {
      const value = item.values?.[key];
      if (value == null) continue;
      sum = (sum ?? 0) + value;
    }
    total[key] = sum;
  }

  for (let i = 0; i < perIngredient.length; i++) {
    const item = perIngredient[i];
    if (ingredients[i].isOptional && item.counted) includesOptional = true;
    if (!item.counted && item.reason) {
      // "dle chuti" / "špetka" are expected and not worth alarming about.
      if (item.reason === "not_quantifiable") continue;
      missing.push({ label: item.label, reason: REASON_TEXT[item.reason] });
    }
  }

  const perServing: NutritionValues = {};
  for (const key of NUTRIENT_KEYS) {
    const value = total[key];
    perServing[key] =
      value != null && baseServings > 0 ? value / baseServings : null;
  }

  return {
    total,
    perServing,
    incomplete: missing.length > 0,
    missing,
    includesOptional,
    perIngredient,
  };
}

/** Rounds nutrition values for display (kJ whole, grams to 1 decimal). */
export function formatNutrient(
  key: NutrientKey,
  value: number | null | undefined,
): string {
  if (value == null) return "—";
  if (key === "energyKj") return String(Math.round(value));
  return String(Math.round(value * 10) / 10).replace(".", ",");
}
