/**
 * Reverse calculation (zadání §6.4): "I want 600 kJ per serving".
 *
 * One coefficient k scales every unlocked ingredient:
 *   target_total = target_per_serving × servings
 *   k = (target_total − locked_contribution) / free_contribution
 *
 * Generic over the nutrient, not just energy. After scaling, the human
 * rounding rules of §6.2 are applied and the ACTUAL resulting value is
 * reported — never the theoretical one.
 */

import {
  computeIngredientNutrition,
  type NutrientKey,
  type NutritionIngredient,
} from "./nutrition";
import { roundHuman } from "./servings";

/** k outside this band produces a practically nonsensical recipe (§6.4). */
export const K_MIN_SANE = 0.3;
export const K_MAX_SANE = 3;

export type ReverseInput = {
  ingredients: NutritionIngredient[];
  /** Ingredient ids the user locked (🔒). */
  lockedIds: string[];
  nutrient: NutrientKey;
  targetPerServing: number;
  servings: number;
};

export type ReverseError =
  | "no_free_contribution" // every ingredient carrying the nutrient is locked
  | "locked_exceeds_target" // locked ingredients alone are already over
  | "invalid_target";

export const REVERSE_ERROR_MESSAGES: Record<ReverseError, string> = {
  no_free_contribution:
    "Všechny ingredience s touto hodnotou jsou zamčené — není co přepočítat.",
  locked_exceeds_target:
    "Samotné zamčené ingredience už cíl překračují. Odemkni některou, nebo zvyš cíl.",
  invalid_target: "Cílová hodnota musí být větší než nula.",
};

export type ReverseScaledIngredient = {
  ingredientId: string;
  label: string;
  locked: boolean;
  originalAmount: number | null;
  /** Exact amount before rounding (null for locked/unscalable ingredients). */
  exactAmount: number | null;
  /** Amount after §6.2 human rounding — what the user will actually use. */
  roundedAmount: number | null;
  unit: string | null;
  warning: boolean;
};

export type ReverseResult =
  | { ok: false; error: ReverseError }
  | {
      ok: true;
      k: number;
      /** k is far from 1 — the result will be practically nonsensical. */
      kOutOfSaneRange: boolean;
      ingredients: ReverseScaledIngredient[];
      /** Target the user asked for, per serving. */
      targetPerServing: number;
      /** What the recipe really gives per serving AFTER rounding. */
      actualPerServing: number | null;
      /** True when some ingredient could not be counted at all. */
      incomplete: boolean;
    };

function contribution(
  ingredient: NutritionIngredient,
  nutrient: NutrientKey,
): number | null {
  const computed = computeIngredientNutrition(ingredient);
  if (!computed.counted) return null;
  return computed.values?.[nutrient] ?? null;
}

export function reverseCalculate(input: ReverseInput): ReverseResult {
  const { ingredients, lockedIds, nutrient, targetPerServing, servings } = input;
  if (!(targetPerServing > 0) || !(servings > 0)) {
    return { ok: false, error: "invalid_target" };
  }

  const locked = new Set(lockedIds);
  const targetTotal = targetPerServing * servings;

  let lockedSum = 0;
  let freeSum = 0;
  let incomplete = false;

  for (const ingredient of ingredients) {
    const value = contribution(ingredient, nutrient);
    if (value == null) {
      // Cannot be counted — it also cannot be scaled meaningfully.
      const computed = computeIngredientNutrition(ingredient);
      if (!computed.counted && computed.reason !== "not_quantifiable") {
        incomplete = true;
      }
      continue;
    }
    if (locked.has(ingredient.id)) lockedSum += value;
    else freeSum += value;
  }

  if (freeSum <= 0) return { ok: false, error: "no_free_contribution" };
  const k = (targetTotal - lockedSum) / freeSum;
  if (k <= 0) return { ok: false, error: "locked_exceeds_target" };

  const scaled: ReverseScaledIngredient[] = ingredients.map((ingredient) => {
    const isLocked = locked.has(ingredient.id);
    const label = ingredient.label ?? "ingredience";
    if (isLocked || ingredient.amount == null) {
      return {
        ingredientId: ingredient.id,
        label,
        locked: isLocked,
        originalAmount: ingredient.amount,
        exactAmount: null,
        roundedAmount: ingredient.amount,
        unit: ingredient.unit,
        warning: false,
      };
    }
    const exact = ingredient.amount * k;
    const rounded = roundHuman(exact, {
      unit: ingredient.unit,
      divisiblePieces: ingredient.food?.gramsPerPiece != null,
    });
    return {
      ingredientId: ingredient.id,
      label,
      locked: false,
      originalAmount: ingredient.amount,
      exactAmount: Number(exact.toFixed(4)),
      roundedAmount: rounded,
      unit: ingredient.unit,
      warning: exact > 0 && Math.abs(rounded - exact) / exact > 0.15,
    };
  });

  // Recompute with the ROUNDED amounts — this is what the user really gets.
  let actualTotal: number | null = null;
  for (const ingredient of ingredients) {
    const scaledItem = scaled.find((s) => s.ingredientId === ingredient.id);
    const value = contribution(
      { ...ingredient, amount: scaledItem?.roundedAmount ?? ingredient.amount },
      nutrient,
    );
    if (value == null) continue;
    actualTotal = (actualTotal ?? 0) + value;
  }

  return {
    ok: true,
    k,
    kOutOfSaneRange: k < K_MIN_SANE || k > K_MAX_SANE,
    ingredients: scaled,
    targetPerServing,
    actualPerServing: actualTotal != null ? actualTotal / servings : null,
    incomplete,
  };
}
