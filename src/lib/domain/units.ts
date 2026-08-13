/**
 * Unit conversions (zadání §6.1). Core rule: when a conversion is not
 * possible, NEVER guess — return the reason so the UI can say what is missing.
 */

export type ConversionUnit =
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "ks"
  | "lzicka"
  | "lzice"
  | "spetka"
  | "dle_chuti";

/** Food data needed for conversions; all fields optional/nullable. */
export type ConversionFood = {
  densityGPerMl?: number | null;
  gramsPerPiece?: number | null;
  /** Custom per-food units: "1 lžíce mouky = 12 g" */
  units?: { unit: string; gramsPerUnit: number }[] | null;
};

export type MissingReason =
  | "no_amount" // amount is null (e.g. "dle chuti")
  | "not_quantifiable" // špetka / dle chuti — no meaningful quantity
  | "no_food" // free-text ingredient, nothing to look up
  | "no_density" // ml <-> g needs foods.density_g_per_ml
  | "no_grams_per_piece" // ks <-> g needs foods.grams_per_piece
  | "no_food_unit" // lžíce/lžička needs a food_units row
  | "unknown_unit";

export type ConversionResult =
  | { ok: true; value: number }
  | { ok: false; reason: MissingReason };

export const REASON_LABELS: Record<MissingReason, string> = {
  no_amount: "chybí množství",
  not_quantifiable: "množství nelze vyčíslit",
  no_food: "není propojeno s potravinou",
  no_density: "chybí hustota potraviny",
  no_grams_per_piece: "chybí hmotnost kusu",
  no_food_unit: "chybí převod lžíce/lžičky pro tuto potravinu",
  unknown_unit: "neznámá jednotka",
};

const UNQUANTIFIABLE: ConversionUnit[] = ["spetka", "dle_chuti"];

function foodUnitGrams(
  food: ConversionFood | null | undefined,
  unit: string,
): number | null {
  const match = food?.units?.find((u) => u.unit === unit);
  return match ? match.gramsPerUnit : null;
}

/** Converts an ingredient amount to grams, or explains why it cannot. */
export function toGrams(
  amount: number | null,
  unit: string | null,
  food?: ConversionFood | null,
): ConversionResult {
  if (amount == null) return { ok: false, reason: "no_amount" };
  if (unit == null) return { ok: false, reason: "unknown_unit" };
  if (UNQUANTIFIABLE.includes(unit as ConversionUnit)) {
    return { ok: false, reason: "not_quantifiable" };
  }

  switch (unit) {
    case "g":
      return { ok: true, value: amount };
    case "kg":
      return { ok: true, value: amount * 1000 };
    case "ml":
    case "l": {
      const ml = unit === "l" ? amount * 1000 : amount;
      if (!food) return { ok: false, reason: "no_food" };
      if (!food.densityGPerMl) return { ok: false, reason: "no_density" };
      return { ok: true, value: ml * food.densityGPerMl };
    }
    case "ks": {
      if (!food) return { ok: false, reason: "no_food" };
      const perPiece =
        food.gramsPerPiece ?? foodUnitGrams(food, "ks") ?? null;
      if (!perPiece) return { ok: false, reason: "no_grams_per_piece" };
      return { ok: true, value: amount * perPiece };
    }
    case "lzice":
    case "lzicka": {
      if (!food) return { ok: false, reason: "no_food" };
      // Per-food only: a spoon of flour is not a spoon of oil (§6.1).
      const perUnit = foodUnitGrams(food, unit);
      if (!perUnit) return { ok: false, reason: "no_food_unit" };
      return { ok: true, value: amount * perUnit };
    }
    default:
      return { ok: false, reason: "unknown_unit" };
  }
}

/** Converts an ingredient amount to millilitres, or explains why it cannot. */
export function toMillilitres(
  amount: number | null,
  unit: string | null,
  food?: ConversionFood | null,
): ConversionResult {
  if (amount == null) return { ok: false, reason: "no_amount" };
  if (unit == null) return { ok: false, reason: "unknown_unit" };
  if (UNQUANTIFIABLE.includes(unit as ConversionUnit)) {
    return { ok: false, reason: "not_quantifiable" };
  }
  if (unit === "ml") return { ok: true, value: amount };
  if (unit === "l") return { ok: true, value: amount * 1000 };

  // Everything else goes through grams and needs a density.
  const grams = toGrams(amount, unit, food);
  if (!grams.ok) return grams;
  if (!food?.densityGPerMl) return { ok: false, reason: "no_density" };
  return { ok: true, value: grams.value / food.densityGPerMl };
}

/** Converts an ingredient amount to a piece count, or explains why it cannot. */
export function toPieces(
  amount: number | null,
  unit: string | null,
  food?: ConversionFood | null,
): ConversionResult {
  if (amount == null) return { ok: false, reason: "no_amount" };
  if (unit === "ks") return { ok: true, value: amount };
  const grams = toGrams(amount, unit, food);
  if (!grams.ok) return grams;
  const perPiece = food?.gramsPerPiece ?? foodUnitGrams(food, "ks") ?? null;
  if (!perPiece) return { ok: false, reason: "no_grams_per_piece" };
  return { ok: true, value: grams.value / perPiece };
}

/** Which conversions are offered in the UI for a given food. */
export function availableUnits(food?: ConversionFood | null): ConversionUnit[] {
  const units: ConversionUnit[] = ["g", "kg", "spetka", "dle_chuti"];
  if (food?.densityGPerMl) units.push("ml", "l");
  if (food?.gramsPerPiece || foodUnitGrams(food, "ks")) units.push("ks");
  if (foodUnitGrams(food, "lzice")) units.push("lzice");
  if (foodUnitGrams(food, "lzicka")) units.push("lzicka");
  return units;
}
