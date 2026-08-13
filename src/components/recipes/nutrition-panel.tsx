"use client";

import { useState } from "react";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  computeRecipeNutrition,
  formatNutrient,
  kjToKcal,
  type NutritionIngredient,
} from "@/lib/domain/nutrition";

/**
 * Per-serving nutrition for a recipe. Values never pretend to be complete —
 * missing conversions are listed explicitly (zadání §6.1, §6.3).
 */
export function NutritionPanel({
  ingredients,
  baseServings,
  servings,
}: {
  ingredients: NutritionIngredient[];
  baseServings: number;
  servings: number;
}) {
  const [showTotal, setShowTotal] = useState(false);
  const nutrition = computeRecipeNutrition(ingredients, baseServings);

  const hasAnything = NUTRIENT_KEYS.some(
    (key) => nutrition.perServing[key] != null,
  );
  if (!hasAnything && nutrition.missing.length === 0) return null;

  // Per-serving values are constant when scaling; totals follow the servings.
  const values = showTotal
    ? Object.fromEntries(
        NUTRIENT_KEYS.map((key) => [
          key,
          nutrition.perServing[key] != null
            ? nutrition.perServing[key]! * servings
            : null,
        ]),
      )
    : nutrition.perServing;

  const energy = values.energyKj as number | null | undefined;

  return (
    <section className="mt-6 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Nutriční hodnoty</h2>
        <div className="flex gap-1 rounded-lg border border-border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setShowTotal(false)}
            className={`rounded px-3 py-1.5 ${
              !showTotal ? "bg-surface-warm text-primary" : "text-muted-foreground"
            }`}
          >
            na porci
          </button>
          <button
            type="button"
            onClick={() => setShowTotal(true)}
            className={`rounded px-3 py-1.5 ${
              showTotal ? "bg-surface-warm text-primary" : "text-muted-foreground"
            }`}
          >
            celý recept ({servings} porcí)
          </button>
        </div>
      </div>

      {!hasAnything ? (
        <p className="text-sm text-muted-foreground">
          Nutriční hodnoty zatím nelze spočítat — žádná ingredience nemá
          použitelná data.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-baseline gap-3">
            <span className="font-display text-3xl font-semibold text-primary">
              {formatNutrient("energyKj", energy)} kJ
            </span>
            {energy != null && (
              <span className="text-muted-foreground">
                ({Math.round(kjToKcal(energy))} kcal)
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {NUTRIENT_KEYS.filter((key) => key !== "energyKj").map((key) => (
              <div
                key={key}
                className="flex justify-between border-b border-border/60 py-1"
              >
                <dt
                  className={
                    key === "sugarsG" || key === "satFatG"
                      ? "pl-3 text-muted-foreground"
                      : ""
                  }
                >
                  {NUTRIENT_LABELS[key]}
                </dt>
                <dd className="font-medium">
                  {formatNutrient(key, values[key] as number | null)}{" "}
                  {NUTRIENT_UNITS[key]}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {nutrition.incomplete && (
        <p className="mt-3 rounded-lg bg-surface-warm p-2.5 text-xs leading-relaxed">
          ⚠️ <strong>Hodnoty nejsou úplné.</strong> Nezapočítáno:{" "}
          {nutrition.missing
            .map((m) => `${m.label} (${m.reason})`)
            .join(", ")}
          .
        </p>
      )}
      {nutrition.includesOptional && (
        <p className="mt-2 text-xs text-muted-foreground">
          Včetně volitelných surovin.
        </p>
      )}
    </section>
  );
}
