import { describe, expect, it } from "vitest";
import {
  formatInDimension,
  formatPackageSize,
  packagesNeeded,
  parsePackageSize,
} from "./rohlik-packaging";

const flour = { densityGPerMl: 0.53, gramsPerPiece: null, units: [] };
const egg = {
  densityGPerMl: null,
  gramsPerPiece: 60,
  units: [{ unit: "ks", gramsPerUnit: 60 }],
};

describe("parsePackageSize", () => {
  it("reads kilograms and grams", () => {
    expect(parsePackageSize({ unit: "kg", textualAmount: "1 kg" })).toEqual({
      dimension: "mass",
      grams: 1000,
    });
    expect(parsePackageSize({ unit: "kg", textualAmount: "500 g" })).toEqual({
      dimension: "mass",
      grams: 500,
    });
  });

  it("reads litres and millilitres, decimal comma included", () => {
    expect(parsePackageSize({ unit: "l", textualAmount: "0,5 l" })).toEqual({
      dimension: "volume",
      millilitres: 500,
    });
    expect(parsePackageSize({ unit: "l", textualAmount: "330 ml" })).toEqual({
      dimension: "volume",
      millilitres: 330,
    });
  });

  it("multiplies out a multipack", () => {
    expect(parsePackageSize({ unit: "kg", textualAmount: "2x250 g" })).toEqual({
      dimension: "mass",
      grams: 500,
    });
    expect(parsePackageSize({ unit: "l", textualAmount: "6 × 1,5 l" })).toEqual(
      {
        dimension: "volume",
        millilitres: 9000,
      },
    );
  });

  it("ignores an approximate prefix", () => {
    expect(
      parsePackageSize({ unit: "kg", textualAmount: "cca 400 g" }),
    ).toEqual({ dimension: "mass", grams: 400 });
  });

  it("falls back to one piece for goods sold per piece", () => {
    expect(parsePackageSize({ unit: "ks", textualAmount: null })).toEqual({
      dimension: "pieces",
      pieces: 1,
    });
    expect(parsePackageSize({ unit: "ks", textualAmount: "10 ks" })).toEqual({
      dimension: "pieces",
      pieces: 10,
    });
  });

  it("gives up rather than guessing", () => {
    expect(
      parsePackageSize({ unit: "balení", textualAmount: "velké balení" }),
    ).toBeNull();
    expect(parsePackageSize({ unit: null, textualAmount: null })).toBeNull();
  });
});

describe("packagesNeeded", () => {
  const kilo = { unit: "kg", textualAmount: "1 kg" };

  it("rounds up to whole packages and reports the surplus", () => {
    const result = packagesNeeded(2400, "g", flour, kilo);
    expect(result).toEqual({
      ok: true,
      packages: 3,
      packageSize: { dimension: "mass", grams: 1000 },
      needed: 2400,
      surplus: 600,
    });
  });

  it("buys one package for anything smaller than one", () => {
    const result = packagesNeeded(200, "g", flour, kilo);
    expect(result.ok && result.packages).toBe(1);
  });

  it("comes out even when the need is a whole multiple", () => {
    const result = packagesNeeded(2, "kg", flour, kilo);
    expect(result.ok && result.surplus).toBe(0);
  });

  it("converts through the food when the units differ", () => {
    // 500 ml of flour at 0.53 g/ml = 265 g → one 500 g bag.
    const result = packagesNeeded(500, "ml", flour, {
      unit: "kg",
      textualAmount: "500 g",
    });
    expect(result.ok && result.packages).toBe(1);
    expect(result.ok && result.needed).toBe(265);
  });

  it("counts pieces for goods sold per piece", () => {
    const result = packagesNeeded(10, "ks", egg, {
      unit: "ks",
      textualAmount: "10 ks",
    });
    expect(result.ok && result.packages).toBe(1);
  });

  it("converts grams to pieces when the food knows its piece weight", () => {
    const result = packagesNeeded(180, "g", egg, {
      unit: "ks",
      textualAmount: "10 ks",
    });
    // 3 eggs out of a box of 10.
    expect(result.ok && result.packages).toBe(1);
    expect(result.ok && result.needed).toBe(3);
  });

  it("explains an unparsable package instead of assuming one piece", () => {
    const result = packagesNeeded(500, "g", flour, {
      unit: "balení",
      textualAmount: "velké balení",
    });
    expect(result).toEqual({ ok: false, reason: "unknown_package" });
  });

  it("passes the conversion's own reason through", () => {
    expect(packagesNeeded(null, "g", flour, kilo)).toEqual({
      ok: false,
      reason: "no_amount",
    });
    expect(packagesNeeded(1, "dle_chuti", flour, kilo)).toEqual({
      ok: false,
      reason: "not_quantifiable",
    });
    // Free-text item: no food, so ml cannot become grams.
    expect(
      packagesNeeded(200, "ml", null, { unit: "kg", textualAmount: "500 g" }),
    ).toEqual({ ok: false, reason: "no_food" });
  });

  it("does not leak floating-point dust into the surplus", () => {
    const result = packagesNeeded(100, "ml", null, {
      unit: "l",
      textualAmount: "0,1 l",
    });
    expect(result.ok && result.surplus).toBe(0);
  });
});

describe("formatPackageSize", () => {
  it("reads back the way a shelf label does", () => {
    expect(formatPackageSize({ dimension: "mass", grams: 1000 })).toBe("1 kg");
    expect(formatPackageSize({ dimension: "mass", grams: 500 })).toBe("500 g");
    expect(formatPackageSize({ dimension: "volume", millilitres: 1500 })).toBe(
      "1,5 l",
    );
    expect(formatPackageSize({ dimension: "pieces", pieces: 6 })).toBe("6 ks");
  });

  it("gives the needed and surplus numbers their unit back", () => {
    // Both come out of packagesNeeded as bare numbers in the package's own
    // dimension — "zbyde 200" alone would not say of what.
    expect(formatInDimension("mass", 200)).toBe("200 g");
    expect(formatInDimension("mass", 2400)).toBe("2,4 kg");
    expect(formatInDimension("volume", 500)).toBe("500 ml");
    expect(formatInDimension("pieces", 4)).toBe("4 ks");
  });
});
