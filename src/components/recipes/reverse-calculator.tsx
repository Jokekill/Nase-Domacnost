"use client";

import { useState } from "react";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  computeRecipeNutrition,
  formatNutrient,
  type NutrientKey,
  type NutritionIngredient,
} from "@/lib/domain/nutrition";
import {
  REVERSE_ERROR_MESSAGES,
  reverseCalculate,
} from "@/lib/domain/reverse";
import { formatScaled } from "@/lib/domain/servings";
import { UNIT_LABELS, type Unit } from "@/lib/recipes/types";

const unitLabel = (unit: string | null) =>
  unit ? (UNIT_LABELS[unit as Unit] ?? unit) : "";

/**
 * "I want 600 kJ per serving" (zadání §6.4). Locked ingredients keep their
 * amounts; the rest are scaled by a single coefficient. The result shown is
 * always the value AFTER rounding, never the theoretical one.
 */
export function ReverseCalculator({
  ingredients,
  servings,
  baseServings,
}: {
  ingredients: NutritionIngredient[];
  servings: number;
  baseServings: number;
}) {
  const [open, setOpen] = useState(false);
  const [nutrient, setNutrient] = useState<NutrientKey>("energyKj");
  const [target, setTarget] = useState("");
  const [locked, setLocked] = useState<string[]>([]);

  const current = computeRecipeNutrition(ingredients, baseServings);
  const currentValue = current.perServing[nutrient];

  const targetNumber = Number(target.replace(",", "."));
  const result =
    target.trim() !== "" && Number.isFinite(targetNumber)
      ? reverseCalculate({
          ingredients,
          lockedIds: locked,
          nutrient,
          targetPerServing: targetNumber,
          servings,
        })
      : null;

  function toggleLock(id: string) {
    setLocked((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  return (
    <section className="mt-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-xl font-semibold">Dopočítat na cílovou hodnotu</h2>
        <span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            Zadej, kolik chceš mít na porci. Zamčené suroviny (🔒) se nezmění,
            ostatní se přepočítají.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Veličina</span>
              <select
                value={nutrient}
                onChange={(e) => setNutrient(e.target.value as NutrientKey)}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm min-h-11"
              >
                {NUTRIENT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {NUTRIENT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Cíl na porci ({NUTRIENT_UNITS[nutrient]})
              </span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                placeholder={
                  currentValue != null
                    ? formatNutrient(nutrient, currentValue)
                    : "např. 2000"
                }
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-11"
              />
            </label>
            <p className="pb-2 text-sm text-muted-foreground">
              nyní:{" "}
              <strong>
                {formatNutrient(nutrient, currentValue)}{" "}
                {NUTRIENT_UNITS[nutrient]}
              </strong>
            </p>
          </div>

          <ul className="space-y-1">
            {ingredients.map((i) => {
              const isLocked = locked.includes(i.id);
              const scaled =
                result?.ok === true
                  ? result.ingredients.find((s) => s.ingredientId === i.id)
                  : undefined;
              const changed =
                scaled && !scaled.locked && scaled.roundedAmount !== i.amount;
              return (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-1 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleLock(i.id)}
                    className="flex items-center gap-2 text-left min-h-11"
                    title={isLocked ? "Odemknout" : "Zamknout"}
                  >
                    <span>{isLocked ? "🔒" : "🔄"}</span>
                    <span className={isLocked ? "text-muted-foreground" : ""}>
                      {i.label}
                    </span>
                  </button>
                  <span className="shrink-0 text-right">
                    {changed ? (
                      <>
                        <span className="text-muted-foreground line-through">
                          {formatScaled(i.amount)} {unitLabel(i.unit)}
                        </span>{" "}
                        <strong className="text-primary">
                          {scaled?.warning && "⚠️ "}
                          {formatScaled(scaled?.roundedAmount ?? null)}{" "}
                          {unitLabel(i.unit)}
                        </strong>
                      </>
                    ) : (
                      <span className={isLocked ? "text-muted-foreground" : ""}>
                        {formatScaled(i.amount)} {unitLabel(i.unit)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {result && !result.ok && (
            <p className="rounded-lg bg-surface-warm p-3 text-sm text-destructive">
              {REVERSE_ERROR_MESSAGES[result.error]}
            </p>
          )}

          {result?.ok === true && (
            <div className="space-y-2">
              {result.kOutOfSaneRange && (
                <p className="rounded-lg bg-surface-warm p-3 text-sm">
                  ⚠️ Přepočet mění množství{" "}
                  {result.k > 1 ? "více než 3×" : "na méně než třetinu"} —
                  výsledek nejspíš nebude dávat smysl.
                </p>
              )}
              <p className="rounded-lg bg-surface-warm p-3 text-sm">
                Po zaokrouhlení vyjde{" "}
                <strong>
                  {formatNutrient(nutrient, result.actualPerServing)}{" "}
                  {NUTRIENT_UNITS[nutrient]}
                </strong>{" "}
                na porci (cíl {formatNutrient(nutrient, result.targetPerServing)}{" "}
                {NUTRIENT_UNITS[nutrient]}).
                {result.incomplete &&
                  " Některé suroviny nemají data, výsledek je neúplný."}
              </p>
              <p className="text-xs text-muted-foreground">
                Toto je jen náhled — recept se nemění. Přepiš si množství ručně
                v editaci, pokud ti výsledek sedí.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
