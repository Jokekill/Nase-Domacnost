import { describe, expect, it } from "vitest";
import {
  computeIngredientNutrition,
  computeRecipeNutrition,
  formatNutrient,
  kjToKcal,
  type NutritionIngredient,
} from "./nutrition";

const flour = {
  referenceUnit: "100g",
  energyKj: 1450,
  proteinG: 10,
  carbsG: 72,
  sugarsG: 1.2,
  fiberG: 2.7,
  fatG: 1,
  satFatG: 0.2,
  saltG: 0,
  densityGPerMl: 0.53,
  gramsPerPiece: null,
  units: [{ unit: "lzice", gramsPerUnit: 12 }],
};
const milk = {
  referenceUnit: "100ml",
  energyKj: 197,
  proteinG: 3.3,
  carbsG: 4.7,
  sugarsG: 4.7,
  fiberG: 0,
  fatG: 1.5,
  satFatG: 1,
  saltG: 0.1,
  densityGPerMl: 1.03,
  gramsPerPiece: null,
  units: null,
};
const eggNoWeight = {
  referenceUnit: "100g",
  energyKj: 590,
  proteinG: 12.6,
  carbsG: 0.7,
  fatG: 9.5,
  densityGPerMl: null,
  gramsPerPiece: null, // deliberately missing — zadání §6.1 example
  units: null,
};
const foodWithoutNutrition = {
  referenceUnit: "100g",
  densityGPerMl: null,
  gramsPerPiece: null,
  units: null,
};

describe("computeIngredientNutrition", () => {
  it("scales per-100 g values by weight", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 300,
      unit: "g",
      food: flour,
      label: "mouka",
    });
    expect(result.counted).toBe(true);
    expect(result.values?.energyKj).toBeCloseTo(4350, 6); // 3 × 1450
    expect(result.values?.proteinG).toBeCloseTo(30, 6);
  });

  it("uses millilitres for 100ml reference foods", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 250,
      unit: "ml",
      food: milk,
      label: "mléko",
    });
    expect(result.values?.energyKj).toBeCloseTo(492.5, 6); // 2.5 × 197
  });

  it("converts spoons via the food's own conversion", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 2,
      unit: "lzice",
      food: flour,
      label: "mouka",
    });
    // 2 × 12 g = 24 g → 0.24 × 1450
    expect(result.values?.energyKj).toBeCloseTo(348, 6);
  });

  it("does not count an ingredient whose weight is unknown", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 2,
      unit: "ks",
      food: eggNoWeight,
      label: "vejce",
    });
    expect(result.counted).toBe(false);
    expect(result.reason).toBe("no_grams_per_piece");
    expect(result.values).toBeNull();
  });

  it("does not count free-text ingredients", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 1,
      unit: "g",
      food: null,
      label: "špetka lásky",
    });
    expect(result.counted).toBe(false);
    expect(result.reason).toBe("no_food");
  });

  it("does not count a food with no nutrition data at all", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 100,
      unit: "g",
      food: foodWithoutNutrition,
      label: "neznámá",
    });
    expect(result.counted).toBe(false);
    expect(result.reason).toBe("no_nutrition_data");
  });

  it("keeps missing single nutrients as null instead of zero", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 100,
      unit: "g",
      food: eggNoWeight, // has no fiberG / saltG
      label: "vejce",
    });
    expect(result.values?.energyKj).toBeCloseTo(590, 6);
    expect(result.values?.fiberG).toBeNull();
    expect(result.values?.saltG).toBeNull();
  });

  it("applies nutritionOverride per recipe and reports it", () => {
    const result = computeIngredientNutrition({
      id: "1",
      amount: 100,
      unit: "g",
      food: flour,
      nutritionOverride: { energyKj: 1390 },
      label: "mouka",
    });
    expect(result.values?.energyKj).toBeCloseTo(1390, 6);
    expect(result.values?.proteinG).toBeCloseTo(10, 6); // not overridden
    expect(result.overriddenKeys).toEqual(["energyKj"]);
  });
});

describe("computeRecipeNutrition", () => {
  const ingredients: NutritionIngredient[] = [
    { id: "a", amount: 300, unit: "g", food: flour, label: "mouka" },
    { id: "b", amount: 250, unit: "ml", food: milk, label: "mléko" },
    { id: "c", amount: 2, unit: "ks", food: eggNoWeight, label: "2 ks vejce" },
    { id: "d", amount: 1, unit: "spetka", food: flour, label: "sůl" },
  ];

  it("sums what it can and flags what it cannot", () => {
    const result = computeRecipeNutrition(ingredients, 4);
    expect(result.total.energyKj).toBeCloseTo(4350 + 492.5, 6);
    expect(result.incomplete).toBe(true);
    expect(result.missing).toEqual([
      { label: "2 ks vejce", reason: "chybí hmotnost kusu" },
    ]);
  });

  it("does not warn about špetka / dle chuti", () => {
    const result = computeRecipeNutrition([ingredients[3]], 4);
    expect(result.missing).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it("computes per-serving values", () => {
    const result = computeRecipeNutrition([ingredients[0]], 4);
    expect(result.perServing.energyKj).toBeCloseTo(4350 / 4, 6);
  });

  it("is complete when every ingredient can be counted", () => {
    const result = computeRecipeNutrition(
      [ingredients[0], ingredients[1]],
      4,
    );
    expect(result.incomplete).toBe(false);
    expect(result.missing).toEqual([]);
  });

  it("reports when optional ingredients are included", () => {
    const result = computeRecipeNutrition(
      [{ ...ingredients[0], isOptional: true }],
      4,
    );
    expect(result.includesOptional).toBe(true);
  });

  it("returns null totals when nothing could be counted", () => {
    const result = computeRecipeNutrition([ingredients[2]], 4);
    expect(result.total.energyKj).toBeNull();
    expect(result.perServing.energyKj).toBeNull();
  });
});

describe("units and formatting", () => {
  it("converts kJ to kcal with the official factor", () => {
    expect(kjToKcal(4184)).toBeCloseTo(1000, 6);
  });
  it("formats energy as whole kJ and grams with one decimal", () => {
    expect(formatNutrient("energyKj", 1234.6)).toBe("1235");
    expect(formatNutrient("proteinG", 10.44)).toBe("10,4");
    expect(formatNutrient("proteinG", null)).toBe("—");
  });
});
