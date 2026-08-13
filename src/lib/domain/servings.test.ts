import { describe, expect, it } from "vitest";
import { formatScaled, roundHuman, scaleIngredient } from "./servings";

describe("roundHuman — g/ml", () => {
  it("rounds >= 100 to tens", () => {
    expect(roundHuman(112, { unit: "g" })).toBe(110);
    expect(roundHuman(105, { unit: "ml" })).toBe(110);
    expect(roundHuman(996, { unit: "g" })).toBe(1000);
  });
  it("rounds 10–100 to fives", () => {
    expect(roundHuman(94, { unit: "g" })).toBe(95);
    expect(roundHuman(12.3, { unit: "ml" })).toBe(10);
    expect(roundHuman(37.5, { unit: "g" })).toBe(40);
  });
  it("rounds < 10 to ones", () => {
    expect(roundHuman(7.3, { unit: "g" })).toBe(7);
    expect(roundHuman(2.6, { unit: "ml" })).toBe(3);
  });
  it("rounds spices < 10 to halves", () => {
    expect(roundHuman(7.3, { unit: "g", isSpice: true })).toBe(7.5);
    expect(roundHuman(1.2, { unit: "g", isSpice: true })).toBe(1);
    expect(roundHuman(0.4, { unit: "g", isSpice: true })).toBe(0.5);
  });
  it("never rounds a positive amount down to zero", () => {
    expect(roundHuman(0.3, { unit: "g" })).toBe(1);
    expect(roundHuman(0.1, { unit: "ml" })).toBe(1);
  });
});

describe("roundHuman — kg/l", () => {
  it("applies g/ml rules on the ×1000 scale", () => {
    expect(roundHuman(1.234, { unit: "kg" })).toBe(1.23); // 1234 g → 1230 g
    expect(roundHuman(0.043, { unit: "l" })).toBe(0.045); // 43 ml → 45 ml
  });
});

describe("roundHuman — pieces", () => {
  it("rounds indivisible pieces to whole numbers", () => {
    expect(roundHuman(1.3, { unit: "ks" })).toBe(1);
    expect(roundHuman(1.5, { unit: "ks" })).toBe(2);
  });
  it("rounds divisible pieces (eggs, onions) to halves", () => {
    expect(roundHuman(1.3, { unit: "ks", divisiblePieces: true })).toBe(1.5);
    expect(roundHuman(0.347, { unit: "ks", divisiblePieces: true })).toBe(0.5);
  });
  it("bumps tiny positive piece counts to the smallest step", () => {
    expect(roundHuman(0.2, { unit: "ks" })).toBe(1);
    expect(roundHuman(0.1, { unit: "ks", divisiblePieces: true })).toBe(0.5);
  });
});

describe("roundHuman — spoons", () => {
  it("rounds lzice/lzicka to halves", () => {
    expect(roundHuman(1.3, { unit: "lzice" })).toBe(1.5);
    expect(roundHuman(0.7, { unit: "lzicka" })).toBe(0.5);
    expect(roundHuman(0.1, { unit: "lzicka" })).toBe(0.5);
  });
});

describe("scaleIngredient", () => {
  it("scales linearly and rounds", () => {
    // 300 g at 4 servings → 8 servings = 600 g
    expect(
      scaleIngredient({ amount: 300, unit: "g" }, 8, 4),
    ).toEqual({ exact: 600, rounded: 600, warning: false });
    // 300 g → 6 servings = 450 g
    expect(scaleIngredient({ amount: 300, unit: "g" }, 6, 4).rounded).toBe(450);
  });
  it("returns original amount at k=1 without warning", () => {
    expect(scaleIngredient({ amount: 333, unit: "g" }, 4, 4)).toEqual({
      exact: 333,
      rounded: 333,
      warning: false,
    });
  });
  it("keeps špetka and dle chuti unscaled", () => {
    expect(scaleIngredient({ amount: 1, unit: "spetka" }, 12, 4).rounded).toBe(1);
    expect(scaleIngredient({ amount: 1, unit: "dle_chuti" }, 12, 4).rounded).toBe(1);
  });
  it("warns when rounding moves the value by more than 15 %", () => {
    // 1 egg at 3 servings → 4 servings = 1.333 → rounded 1.5, diff 12.5 % → no warning
    const egg = scaleIngredient(
      { amount: 1, unit: "ks", divisiblePieces: true },
      4,
      3,
    );
    expect(egg.rounded).toBe(1.5);
    expect(egg.warning).toBe(false);
    // 1 can at 4 servings → 6 servings = 1.5 → rounded 2, diff 33 % → warning
    const can = scaleIngredient({ amount: 1, unit: "ks" }, 6, 4);
    expect(can.rounded).toBe(2);
    expect(can.warning).toBe(true);
  });
  it("handles null amounts", () => {
    expect(scaleIngredient({ amount: null, unit: "g" }, 8, 4)).toEqual({
      exact: null,
      rounded: null,
      warning: false,
    });
  });
});

describe("formatScaled", () => {
  it("formats with Czech decimal comma", () => {
    expect(formatScaled(1.5)).toBe("1,5");
    expect(formatScaled(600)).toBe("600");
    expect(formatScaled(null)).toBe("");
    expect(formatScaled(1.23)).toBe("1,23");
  });
});
