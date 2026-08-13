import { describe, expect, it } from "vitest";
import { availableUnits, toGrams, toMillilitres, toPieces } from "./units";

const flour = {
  densityGPerMl: 0.53,
  gramsPerPiece: null,
  units: [
    { unit: "lzice", gramsPerUnit: 12 },
    { unit: "lzicka", gramsPerUnit: 4 },
  ],
};
const oil = {
  densityGPerMl: 0.92,
  gramsPerPiece: null,
  units: [{ unit: "lzice", gramsPerUnit: 14 }],
};
const egg = { densityGPerMl: null, gramsPerPiece: 58, units: null };
const bareFood = { densityGPerMl: null, gramsPerPiece: null, units: null };

describe("toGrams — always possible", () => {
  it("passes grams through and scales kg", () => {
    expect(toGrams(300, "g")).toEqual({ ok: true, value: 300 });
    expect(toGrams(1.5, "kg")).toEqual({ ok: true, value: 1500 });
  });
});

describe("toGrams — needs density", () => {
  it("converts ml and l with density", () => {
    expect(toGrams(100, "ml", flour)).toEqual({ ok: true, value: 53 });
    expect(toGrams(0.5, "l", oil)).toEqual({ ok: true, value: 460 });
  });
  it("refuses without density instead of guessing", () => {
    expect(toGrams(100, "ml", bareFood)).toEqual({
      ok: false,
      reason: "no_density",
    });
    expect(toGrams(100, "ml", null)).toEqual({ ok: false, reason: "no_food" });
  });
});

describe("toGrams — pieces", () => {
  it("uses grams_per_piece", () => {
    expect(toGrams(2, "ks", egg)).toEqual({ ok: true, value: 116 });
  });
  it("refuses without piece weight (zadání: 2 ks vejce bez hmotnosti)", () => {
    expect(toGrams(2, "ks", bareFood)).toEqual({
      ok: false,
      reason: "no_grams_per_piece",
    });
  });
});

describe("toGrams — spoons are per food", () => {
  it("uses the food's own spoon weight", () => {
    expect(toGrams(2, "lzice", flour)).toEqual({ ok: true, value: 24 });
    // A spoon of oil is heavier than a spoon of flour — no global constant.
    expect(toGrams(2, "lzice", oil)).toEqual({ ok: true, value: 28 });
  });
  it("refuses when the food has no spoon conversion", () => {
    expect(toGrams(1, "lzicka", oil)).toEqual({
      ok: false,
      reason: "no_food_unit",
    });
    expect(toGrams(1, "lzice", bareFood)).toEqual({
      ok: false,
      reason: "no_food_unit",
    });
  });
});

describe("toGrams — unquantifiable and missing input", () => {
  it("never invents a value for špetka / dle chuti", () => {
    expect(toGrams(1, "spetka", flour)).toEqual({
      ok: false,
      reason: "not_quantifiable",
    });
    expect(toGrams(1, "dle_chuti", flour)).toEqual({
      ok: false,
      reason: "not_quantifiable",
    });
  });
  it("reports missing amount and unknown unit", () => {
    expect(toGrams(null, "g")).toEqual({ ok: false, reason: "no_amount" });
    expect(toGrams(1, null)).toEqual({ ok: false, reason: "unknown_unit" });
    expect(toGrams(1, "hrst", flour)).toEqual({
      ok: false,
      reason: "unknown_unit",
    });
  });
});

describe("toMillilitres", () => {
  it("passes ml through and scales l without needing density", () => {
    expect(toMillilitres(250, "ml", bareFood)).toEqual({ ok: true, value: 250 });
    expect(toMillilitres(1, "l", bareFood)).toEqual({ ok: true, value: 1000 });
  });
  it("converts grams via density", () => {
    expect(toMillilitres(53, "g", flour).ok).toBe(true);
    expect(
      (toMillilitres(53, "g", flour) as { value: number }).value,
    ).toBeCloseTo(100, 6);
  });
  it("refuses grams without density", () => {
    expect(toMillilitres(100, "g", bareFood)).toEqual({
      ok: false,
      reason: "no_density",
    });
  });
});

describe("toPieces", () => {
  it("passes pieces through", () => {
    expect(toPieces(3, "ks", egg)).toEqual({ ok: true, value: 3 });
  });
  it("derives pieces from grams", () => {
    expect(toPieces(116, "g", egg)).toEqual({ ok: true, value: 2 });
  });
  it("refuses without piece weight", () => {
    expect(toPieces(100, "g", bareFood)).toEqual({
      ok: false,
      reason: "no_grams_per_piece",
    });
  });
});

describe("availableUnits", () => {
  it("offers only conversions the food actually supports", () => {
    expect(availableUnits(flour)).toEqual([
      "g",
      "kg",
      "spetka",
      "dle_chuti",
      "ml",
      "l",
      "lzice",
      "lzicka",
    ]);
    expect(availableUnits(egg)).toEqual([
      "g",
      "kg",
      "spetka",
      "dle_chuti",
      "ks",
    ]);
    expect(availableUnits(bareFood)).toEqual(["g", "kg", "spetka", "dle_chuti"]);
  });
});
