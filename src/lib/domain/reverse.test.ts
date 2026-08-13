import { describe, expect, it } from "vitest";
import type { NutritionIngredient } from "./nutrition";
import { reverseCalculate } from "./reverse";

const flour = {
  referenceUnit: "100g",
  energyKj: 1450,
  proteinG: 10,
  densityGPerMl: null,
  gramsPerPiece: null,
  units: null,
};
const oil = {
  referenceUnit: "100g",
  energyKj: 3700,
  proteinG: 0,
  densityGPerMl: 0.92,
  gramsPerPiece: null,
  units: null,
};
const eggNoWeight = {
  referenceUnit: "100g",
  energyKj: 590,
  densityGPerMl: null,
  gramsPerPiece: null,
  units: null,
};

function ing(
  id: string,
  amount: number | null,
  unit: string | null,
  food: NutritionIngredient["food"],
  label = id,
): NutritionIngredient {
  return { id, amount, unit, food, label };
}

describe("reverseCalculate — happy path", () => {
  it("scales free ingredients to hit the target", () => {
    // 200 g flour = 2900 kJ, 4 servings → 725 kJ/serving. Target 500 kJ.
    const result = reverseCalculate({
      ingredients: [ing("a", 200, "g", flour, "mouka")],
      lockedIds: [],
      nutrient: "energyKj",
      targetPerServing: 500,
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.k).toBeCloseTo(2000 / 2900, 6);
    // 200 × 0.6897 = 137.9 → rounded to tens = 140
    expect(result.ingredients[0].roundedAmount).toBe(140);
    // Actual after rounding: 140 g = 2030 kJ / 4 = 507.5
    expect(result.actualPerServing).toBeCloseTo(507.5, 6);
  });

  it("keeps locked ingredients untouched", () => {
    const result = reverseCalculate({
      ingredients: [
        ing("a", 100, "g", flour, "mouka"), // free, 1450 kJ
        ing("b", 50, "g", oil, "olej"), // locked, 1850 kJ
      ],
      lockedIds: ["b"],
      nutrient: "energyKj",
      targetPerServing: 1000,
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // target total 4000, locked 1850 → free must give 2150 → k = 2150/1450
    expect(result.k).toBeCloseTo(2150 / 1450, 6);
    const locked = result.ingredients.find((i) => i.ingredientId === "b");
    expect(locked?.locked).toBe(true);
    expect(locked?.roundedAmount).toBe(50);
  });

  it("works for any nutrient, not just energy", () => {
    // 100 g flour = 10 g protein; target 5 g/serving × 4 = 20 g → k = 2
    const result = reverseCalculate({
      ingredients: [ing("a", 100, "g", flour, "mouka")],
      lockedIds: [],
      nutrient: "proteinG",
      targetPerServing: 5,
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.k).toBeCloseTo(2, 6);
    expect(result.ingredients[0].roundedAmount).toBe(200);
  });
});

describe("reverseCalculate — error cases from zadání §6.4", () => {
  it("refuses when every contributing ingredient is locked", () => {
    const result = reverseCalculate({
      ingredients: [ing("a", 200, "g", flour, "mouka")],
      lockedIds: ["a"],
      nutrient: "energyKj",
      targetPerServing: 500,
      servings: 4,
    });
    expect(result).toEqual({ ok: false, error: "no_free_contribution" });
  });

  it("refuses when locked ingredients already exceed the target", () => {
    const result = reverseCalculate({
      ingredients: [
        ing("a", 100, "g", flour, "mouka"),
        ing("b", 200, "g", oil, "olej"), // locked: 7400 kJ
      ],
      lockedIds: ["b"],
      nutrient: "energyKj",
      targetPerServing: 500, // total 2000 < 7400
      servings: 4,
    });
    expect(result).toEqual({ ok: false, error: "locked_exceeds_target" });
  });

  it("rejects a non-positive target", () => {
    const result = reverseCalculate({
      ingredients: [ing("a", 200, "g", flour)],
      lockedIds: [],
      nutrient: "energyKj",
      targetPerServing: 0,
      servings: 4,
    });
    expect(result).toEqual({ ok: false, error: "invalid_target" });
  });

  it("flags k below 0.3 as out of sane range", () => {
    const result = reverseCalculate({
      ingredients: [ing("a", 1000, "g", flour, "mouka")],
      lockedIds: [],
      nutrient: "energyKj",
      targetPerServing: 500, // needs k ≈ 0.138
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.k).toBeLessThan(0.3);
    expect(result.kOutOfSaneRange).toBe(true);
  });

  it("flags k above 3 as out of sane range", () => {
    const result = reverseCalculate({
      ingredients: [ing("a", 50, "g", flour, "mouka")],
      lockedIds: [],
      nutrient: "energyKj",
      targetPerServing: 2000, // needs k ≈ 11
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kOutOfSaneRange).toBe(true);
  });
});

describe("reverseCalculate — honesty about the result", () => {
  it("reports the real value after rounding, not the theoretical one", () => {
    const result = reverseCalculate({
      ingredients: [ing("a", 7, "g", flour, "koření")],
      lockedIds: [],
      nutrient: "energyKj",
      targetPerServing: 30,
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rounded = result.ingredients[0].roundedAmount!;
    // actual = rounded grams × 14.5 kJ/g / 4 servings
    expect(result.actualPerServing).toBeCloseTo((rounded * 1450) / 100 / 4, 6);
    expect(result.actualPerServing).not.toBe(result.targetPerServing);
  });

  it("marks the result incomplete when an ingredient cannot be counted", () => {
    const result = reverseCalculate({
      ingredients: [
        ing("a", 200, "g", flour, "mouka"),
        ing("b", 2, "ks", eggNoWeight, "vejce"), // unknown piece weight
      ],
      lockedIds: [],
      nutrient: "energyKj",
      targetPerServing: 500,
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.incomplete).toBe(true);
  });

  it("leaves ingredients without an amount alone", () => {
    const result = reverseCalculate({
      ingredients: [
        ing("a", 200, "g", flour, "mouka"),
        ing("b", null, "dle_chuti", flour, "sůl"),
      ],
      lockedIds: [],
      nutrient: "energyKj",
      targetPerServing: 500,
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const salt = result.ingredients.find((i) => i.ingredientId === "b");
    expect(salt?.roundedAmount).toBeNull();
  });
});
