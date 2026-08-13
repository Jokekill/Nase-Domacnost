import { describe, expect, it } from "vitest";
import { mergeShoppingItems, type MergeInput } from "./shopping-merge";

const FLOUR = "food-flour";
const MILK = "food-milk";
const flourFood = {
  densityGPerMl: 0.53,
  gramsPerPiece: null,
  units: [{ unit: "lzice", gramsPerUnit: 12 }],
};

function item(
  overrides: Partial<MergeInput> & Pick<MergeInput, "name" | "amount" | "unit">,
): MergeInput {
  return {
    foodId: null,
    food: null,
    source: {
      label: overrides.source?.label ?? "test",
      amount: overrides.amount,
      unit: overrides.unit,
    },
    ...overrides,
  };
}

describe("mergeShoppingItems — merging by food", () => {
  it("adds up the same food across recipes (zadání example)", () => {
    const merged = mergeShoppingItems([
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 300,
        unit: "g",
        source: { label: "Bábovka", amount: 300, unit: "g" },
      }),
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 500,
        unit: "g",
        source: { label: "Chléb", amount: 500, unit: "g" },
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(800);
    expect(merged[0].unit).toBe("g");
    expect(merged[0].sources.map((s) => s.label)).toEqual(["Bábovka", "Chléb"]);
  });

  it("merges g with kg and shows a friendly unit", () => {
    const merged = mergeShoppingItems([
      item({ foodId: FLOUR, name: "Mouka", amount: 800, unit: "g" }),
      item({ foodId: FLOUR, name: "Mouka", amount: 1, unit: "kg" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(1.8);
    expect(merged[0].unit).toBe("kg");
  });

  it("merges ml with l", () => {
    const merged = mergeShoppingItems([
      item({ foodId: MILK, name: "Mléko", amount: 500, unit: "ml" }),
      item({ foodId: MILK, name: "Mléko", amount: 1, unit: "l" }),
    ]);
    expect(merged[0].amount).toBe(1.5);
    expect(merged[0].unit).toBe("l");
  });

  it("never merges different foods", () => {
    const merged = mergeShoppingItems([
      item({ foodId: FLOUR, name: "Mouka", amount: 300, unit: "g" }),
      item({ foodId: MILK, name: "Mléko", amount: 300, unit: "ml" }),
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("mergeShoppingItems — ambiguous units stay separate", () => {
  it("keeps grams and spoons apart (zadání: 800 g + 2 lžíce)", () => {
    const merged = mergeShoppingItems([
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 800,
        unit: "g",
        food: flourFood,
      }),
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 2,
        unit: "lzice",
        food: flourFood,
      }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => `${m.amount} ${m.unit}`).sort()).toEqual([
      "2 lzice",
      "800 g",
    ]);
  });

  it("adds up identical spoon units", () => {
    const merged = mergeShoppingItems([
      item({ foodId: FLOUR, name: "Mouka", amount: 2, unit: "lzice" }),
      item({ foodId: FLOUR, name: "Mouka", amount: 3, unit: "lzice" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(5);
  });

  it("adds up pieces without converting them to grams", () => {
    const merged = mergeShoppingItems([
      item({ foodId: "egg", name: "Vejce", amount: 4, unit: "ks" }),
      item({ foodId: "egg", name: "Vejce", amount: 2, unit: "ks" }),
    ]);
    expect(merged[0].amount).toBe(6);
    expect(merged[0].unit).toBe("ks");
  });

  it("does not merge grams with millilitres even when density is known", () => {
    const merged = mergeShoppingItems([
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 100,
        unit: "g",
        food: flourFood,
      }),
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 100,
        unit: "ml",
        food: flourFood,
      }),
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("mergeShoppingItems — free text and unquantified items", () => {
  it("merges free-text items by name, case and spacing insensitive", () => {
    const merged = mergeShoppingItems([
      item({ name: "Toaletní papír", amount: 1, unit: "ks" }),
      item({ name: "toaletní papír ", amount: 2, unit: "ks" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(3);
  });

  it("keeps items without amounts", () => {
    const merged = mergeShoppingItems([
      item({ name: "Sůl", amount: null, unit: "dle_chuti" }),
      item({ name: "Sůl", amount: null, unit: "dle_chuti" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBeNull();
    expect(merged[0].sources).toHaveLength(2);
  });

  it("keeps sources already recorded on an existing line", () => {
    // Re-importing a recipe into a list that already holds the flour must not
    // erase where the first 500 g came from.
    const merged = mergeShoppingItems([
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 500,
        unit: "g",
        source: { label: "__manual__", amount: 500, unit: "g" },
        carriedSources: [
          { label: "Chléb (so 15. 8.)", amount: 500, unit: "g" },
        ],
      }),
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 500,
        unit: "g",
        source: { label: "Chléb (znovu)", amount: 500, unit: "g" },
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(1);
    expect(merged[0].unit).toBe("kg");
    expect(merged[0].sources.map((s) => s.label)).toEqual([
      "Chléb (so 15. 8.)",
      "Chléb (znovu)",
    ]);
  });

  it("records every source on a merged line", () => {
    const merged = mergeShoppingItems([
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 300,
        unit: "g",
        source: { label: "Bábovka (pondělí)", amount: 300, unit: "g" },
      }),
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 500,
        unit: "g",
        source: { label: "Chléb (středa)", amount: 500, unit: "g" },
      }),
      item({
        foodId: FLOUR,
        name: "Mouka",
        amount: 200,
        unit: "g",
        source: { label: "Ručně přidáno", amount: 200, unit: "g" },
      }),
    ]);
    expect(merged[0].amount).toBe(1);
    expect(merged[0].unit).toBe("kg");
    expect(merged[0].sources).toHaveLength(3);
  });
});
