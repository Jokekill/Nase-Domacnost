"use client";

import { useState } from "react";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  type NutrientKey,
  type NutritionValues,
} from "@/lib/domain/nutrition";

type FoodValues = NutritionValues & { referenceUnit?: string | null };

const REFERENCE_LABELS: Record<string, string> = {
  "100g": "100 g",
  "100ml": "100 ml",
  piece: "1 kus",
};

/**
 * Per-recipe nutrition override (zadání §5.3). Changes values for THIS recipe
 * only — the shared food database stays untouched. Overridden values are
 * clearly marked and can be reset back to the database value.
 */
export function NutritionOverrideEditor({
  foodName,
  food,
  value,
  onChange,
}: {
  foodName: string;
  food: FoodValues | null;
  value: NutritionValues | null;
  onChange: (next: NutritionValues | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!food) {
    return (
      <p className="text-xs text-muted-foreground">
        Přepis nutričních hodnot je možný jen u ingrediencí propojených
        s potravinou.
      </p>
    );
  }

  const overriddenCount = value
    ? NUTRIENT_KEYS.filter((k) => value[k] != null).length
    : 0;
  const reference = REFERENCE_LABELS[food.referenceUnit ?? "100g"] ?? "100 g";

  function setValue(key: NutrientKey, raw: string) {
    const next: NutritionValues = { ...(value ?? {}) };
    if (raw.trim() === "") delete next[key];
    else {
      const parsed = Number(raw.replace(",", "."));
      if (Number.isFinite(parsed)) next[key] = parsed;
    }
    onChange(Object.keys(next).length > 0 ? next : null);
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-xs"
      >
        <span className={overriddenCount > 0 ? "text-warning" : "text-muted-foreground"}>
          {overriddenCount > 0
            ? `✎ Vlastní nutriční hodnoty (${overriddenCount})`
            : "Vlastní nutriční hodnoty pro tento recept"}
        </span>
        <span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Hodnoty na {reference} pro <strong>{foodName}</strong>. Platí jen
            v tomto receptu — databáze potravin se nezmění. Prázdné pole =
            použije se hodnota z databáze.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NUTRIENT_KEYS.map((key) => {
              const dbValue = food[key];
              const overridden = value?.[key] != null;
              return (
                <label key={key} className="text-xs">
                  <span className="mb-0.5 block">
                    {NUTRIENT_LABELS[key]}{" "}
                    <span className="text-muted-foreground">
                      ({NUTRIENT_UNITS[key]})
                    </span>
                  </span>
                  <input
                    value={value?.[key] ?? ""}
                    onChange={(e) => setValue(key, e.target.value)}
                    inputMode="decimal"
                    placeholder={dbValue != null ? String(dbValue) : "—"}
                    className={`w-full rounded border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring ${
                      overridden
                        ? "border-warning bg-surface-warm"
                        : "border-border bg-background"
                    }`}
                  />
                </label>
              );
            })}
          </div>
          {overriddenCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-primary hover:underline"
            >
              Vrátit všechny hodnoty z databáze
            </button>
          )}
        </div>
      )}
    </div>
  );
}
