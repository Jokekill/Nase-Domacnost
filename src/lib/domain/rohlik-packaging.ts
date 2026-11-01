/**
 * How many packages of a rohlik.cz product cover what the shopping list asks
 * for (D-029).
 *
 * Same rule as the unit conversions it builds on (§6.1): when the answer is
 * not derivable, say WHY instead of guessing. A wrong guess here ends up in a
 * real basket, so "1 kus" is never a silent fallback for a quantity we could
 * not convert — the screen asks instead.
 */

import {
  toGrams,
  toMillilitres,
  toPieces,
  type ConversionFood,
  type MissingReason,
} from "./units";

/** The two fields Rohlík gives us about packaging. */
export type RohlikPackage = {
  /** `unit`: "kg", "g", "l", "ml", "ks", … */
  unit: string | null;
  /** `textualAmount`: "1 kg", "500 g", "6 ks", "2x250 g", "cca 400 g". */
  textualAmount: string | null;
};

export type PackageSize =
  | { dimension: "mass"; grams: number }
  | { dimension: "volume"; millilitres: number }
  | { dimension: "pieces"; pieces: number };

export type PackagingReason = MissingReason | "unknown_package";

export const PACKAGING_REASON_LABELS: Record<"unknown_package", string> = {
  unknown_package: "nejde určit velikost balení",
};

const AMOUNT =
  /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|ks|ku?s[uů]?)\b/i;

/**
 * Reads the package size out of `textualAmount`, falling back to `unit` for
 * the products sold per piece ("ks") with no amount spelled out.
 *
 * Multipacks ("2x250 g") multiply out: what matters is how much food arrives,
 * not how it is boxed.
 */
export function parsePackageSize(pkg: RohlikPackage): PackageSize | null {
  const text = (pkg.textualAmount ?? "").replace(/^\s*(cca|ca|~)\s*/i, "");
  const match = AMOUNT.exec(text);
  if (match) {
    const multiplier = match[1] ? Number(match[1]) : 1;
    const amount = Number(match[2].replace(",", "."));
    const unit = match[3].toLowerCase();
    if (multiplier > 0 && amount > 0) {
      const total = multiplier * amount;
      if (unit === "g") return { dimension: "mass", grams: total };
      if (unit === "kg") return { dimension: "mass", grams: total * 1000 };
      if (unit === "ml") return { dimension: "volume", millilitres: total };
      if (unit === "l")
        return { dimension: "volume", millilitres: total * 1000 };
      return { dimension: "pieces", pieces: total };
    }
  }
  // "Paprika červená — ks": one item is one piece.
  if ((pkg.unit ?? "").trim().toLowerCase().startsWith("ks")) {
    return { dimension: "pieces", pieces: 1 };
  }
  return null;
}

export type PackagesResult =
  | {
      ok: true;
      /** Whole packages to buy — never zero when something is needed. */
      packages: number;
      packageSize: PackageSize;
      /** What the list needs, in the package's own dimension. */
      needed: number;
      /** How much more than needed arrives; 0 when it comes out even. */
      surplus: number;
    }
  | { ok: false; reason: PackagingReason };

/**
 * Whole packages needed for `amount`/`unit` of a food. Rounds up — half a bag
 * of flour is not a thing you can order — and reports the surplus so the
 * screen can show "3 × 1 kg (potřeba 2,4 kg)".
 */
export function packagesNeeded(
  amount: number | null,
  unit: string | null,
  food: ConversionFood | null | undefined,
  pkg: RohlikPackage,
): PackagesResult {
  const size = parsePackageSize(pkg);
  if (!size) return { ok: false, reason: "unknown_package" };

  const converted =
    size.dimension === "mass"
      ? toGrams(amount, unit, food)
      : size.dimension === "volume"
        ? toMillilitres(amount, unit, food)
        : toPieces(amount, unit, food);
  if (!converted.ok) return { ok: false, reason: converted.reason };

  const per =
    size.dimension === "mass"
      ? size.grams
      : size.dimension === "volume"
        ? size.millilitres
        : size.pieces;
  if (per <= 0) return { ok: false, reason: "unknown_package" };

  const packages = Math.max(1, Math.ceil(converted.value / per));
  // Floating point: 3 × 0.1 l is 300.00000000000006 ml, and a surplus of
  // 6e-14 must not read as "o 0 ml víc".
  const surplus = Math.max(0, round(packages * per - converted.value));
  return {
    ok: true,
    packages,
    packageSize: size,
    needed: round(converted.value),
    surplus,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * "1 kg", "500 ml", "6 ks" — a quantity with the unit a shelf label would
 * use. `needed` and `surplus` are plain numbers in the package's own
 * dimension, so they go through here before anyone reads them.
 */
export function formatInDimension(
  dimension: PackageSize["dimension"],
  value: number,
): string {
  if (dimension === "mass") {
    return value >= 1000 ? `${trim(value / 1000)} kg` : `${trim(value)} g`;
  }
  if (dimension === "volume") {
    return value >= 1000 ? `${trim(value / 1000)} l` : `${trim(value)} ml`;
  }
  return `${trim(value)} ks`;
}

/** The same, for a parsed package size. */
export function formatPackageSize(size: PackageSize): string {
  if (size.dimension === "mass") return formatInDimension("mass", size.grams);
  if (size.dimension === "volume") {
    return formatInDimension("volume", size.millilitres);
  }
  return formatInDimension("pieces", size.pieces);
}

function trim(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}
