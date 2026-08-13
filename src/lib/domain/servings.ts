/**
 * Servings recalculation with "human" rounding (zadání §6.2, approved design
 * D-014). Pure functions — the recalculation is a view over stored data and
 * never mutates the recipe.
 */

export type ScalableIngredient = {
  amount: number | null;
  unit: string | null; // Unit enum from schema, or null
  /** Food belongs to the spice group (Koření subtree), or spice-ish unit. */
  isSpice?: boolean;
  /** Half pieces make sense (eggs, onions). foods.divisible_pieces. */
  divisiblePieces?: boolean;
};

export type ScaledAmount = {
  /** Exact linear value before rounding; null when amount is null. */
  exact: number | null;
  /** Human-rounded value shown to the user; null when amount is null. */
  rounded: number | null;
  /**
   * Set when rounding moved the value by more than WARN_RATIO (or the value
   * had to be bumped up from zero). UI must surface it (§6.2: "zaokrouhli
   * a upozorni").
   */
  warning: boolean;
};

/** Rounding moved the value by >15 % → warn (approved threshold, D-014). */
export const WARN_RATIO = 0.15;

function roundToStep(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  // Avoid float dust (0.30000000000000004)
  return Number(rounded.toFixed(4));
}

/** Step for mass/volume in the base unit (g or ml) per §6.2. */
function massStep(value: number, isSpice: boolean): number {
  if (isSpice && value < 10) return 0.5;
  if (value >= 100) return 10;
  if (value >= 10) return 5;
  return 1;
}

export function roundHuman(
  value: number,
  ingredient: Pick<ScalableIngredient, "unit" | "isSpice" | "divisiblePieces">,
): number {
  const { unit } = ingredient;
  const isSpice =
    ingredient.isSpice === true ||
    unit === "spetka" ||
    unit === "lzicka";

  if (value <= 0) return 0;

  switch (unit) {
    case "g":
    case "ml": {
      const step = massStep(value, isSpice);
      const rounded = roundToStep(value, step);
      return rounded === 0 ? step : rounded;
    }
    case "kg":
    case "l": {
      // Apply the g/ml rules on the ×1000 value, then convert back.
      const inBase = value * 1000;
      const step = massStep(inBase, isSpice);
      const rounded = roundToStep(inBase, step);
      return (rounded === 0 ? step : rounded) / 1000;
    }
    case "ks": {
      const step = ingredient.divisiblePieces ? 0.5 : 1;
      const rounded = roundToStep(value, step);
      return rounded === 0 ? step : rounded;
    }
    case "lzice":
    case "lzicka": {
      const rounded = roundToStep(value, 0.5);
      return rounded === 0 ? 0.5 : rounded;
    }
    // spetka / dle_chuti / unknown units are not scaled numerically
    default:
      return value;
  }
}

const UNSCALED_UNITS = new Set(["spetka", "dle_chuti"]);

export function scaleIngredient(
  ingredient: ScalableIngredient,
  targetServings: number,
  baseServings: number,
): ScaledAmount {
  if (
    ingredient.amount == null ||
    baseServings <= 0 ||
    targetServings <= 0
  ) {
    return { exact: null, rounded: null, warning: false };
  }
  if (UNSCALED_UNITS.has(ingredient.unit ?? "")) {
    // "špetka" and "dle chuti" stay as-is regardless of servings.
    return {
      exact: ingredient.amount,
      rounded: ingredient.amount,
      warning: false,
    };
  }

  const k = targetServings / baseServings;
  const exact = ingredient.amount * k;
  if (k === 1) {
    return { exact, rounded: ingredient.amount, warning: false };
  }
  const rounded = roundHuman(exact, ingredient);
  const warning =
    exact > 0 && Math.abs(rounded - exact) / exact > WARN_RATIO;
  return { exact: Number(exact.toFixed(4)), rounded, warning };
}

/** Czech-style display: 0.5 → "0,5", integers without decimals. */
export function formatScaled(value: number | null): string {
  if (value == null) return "";
  const fixed = Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2))).replace(".", ",");
  return fixed;
}
