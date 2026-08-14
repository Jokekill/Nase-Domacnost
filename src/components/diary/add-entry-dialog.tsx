"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { UNITS } from "@/db/schema";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
} from "@/lib/domain/nutrition";
import { UNIT_LABELS, type Unit } from "@/lib/recipes/types";
import type { RecipeListResponse } from "@/lib/recipes/types";

type Food = { id: string; name: string; referenceUnit: string };
type MealType = { id: string; name: string };

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium";

type Mode = "recipe" | "food" | "manual";

/** Add one thing you actually ate: a recipe portion, a food, or free values. */
export function AddEntryDialog({
  date,
  mealTypes,
  onClose,
  onSave,
}: {
  date: string;
  mealTypes: MealType[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<Mode>("recipe");
  const [entryDate, setEntryDate] = useState(date);
  const [mealTypeId, setMealTypeId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipeTitle, setRecipeTitle] = useState<string | null>(null);
  const [servings, setServings] = useState("1");

  const [foodId, setFoodId] = useState<string | null>(null);
  const [foodTitle, setFoodTitle] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<string>("g");

  const [manualTitle, setManualTitle] = useState("");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: recipes } = useQuery({
    queryKey: ["recipes", debounced],
    queryFn: () =>
      apiFetch<RecipeListResponse>(
        `/api/recipes?limit=8&q=${encodeURIComponent(debounced)}`,
      ),
    enabled: mode === "recipe",
  });
  const { data: foods } = useQuery({
    queryKey: ["foods", debounced],
    queryFn: () =>
      apiFetch<{ items: Food[] }>(
        `/api/foods?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: mode === "food",
  });

  const num = (value: string) =>
    value.trim() === "" ? null : Number(value.replace(",", "."));

  function buildPayload(): Record<string, unknown> | null {
    const common = {
      date: entryDate,
      mealTypeId: mealTypeId || null,
    };
    if (mode === "recipe") {
      if (!recipeId) return null;
      return {
        ...common,
        sourceKind: "recipe",
        recipeId,
        servings: num(servings) ?? 1,
      };
    }
    if (mode === "food") {
      const parsed = num(amount);
      if (!foodId || !parsed) return null;
      return { ...common, sourceKind: "food", foodId, amount: parsed, unit };
    }
    if (!manualTitle.trim()) return null;
    const nutrition: Record<string, number> = {};
    for (const key of NUTRIENT_KEYS) {
      const parsed = num(manualValues[key] ?? "");
      if (parsed != null) nutrition[key] = parsed;
    }
    return {
      ...common,
      sourceKind: "manual",
      title: manualTitle.trim(),
      amount: num(amount),
      unit: unit || null,
      nutrition,
    };
  }

  const payload = buildPayload();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-4 shadow-pop sm:rounded-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Přidat do deníku</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm min-h-11"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-lg border border-border p-0.5 text-sm">
          {(
            [
              ["recipe", "Z receptu"],
              ["food", "Potravina"],
              ["manual", "Ručně"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              onClick={() => {
                setMode(value);
                setSearch("");
              }}
              className={`grow rounded px-3 py-2 ${
                mode === value
                  ? "bg-surface-warm text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label>
            <span className={label}>Den</span>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>Jídlo</span>
            <select
              value={mealTypeId}
              onChange={(e) => setMealTypeId(e.target.value)}
              className={input}
            >
              <option value="">— neurčeno —</option>
              {mealTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {mode === "recipe" && (
          <>
            {recipeId ? (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-accent-green bg-surface-warm px-3 py-2 text-sm">
                <span>{recipeTitle}</span>
                <button
                  onClick={() => {
                    setRecipeId(null);
                    setRecipeTitle(null);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  změnit
                </button>
              </div>
            ) : (
              <>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat recept…"
                  className={input}
                />
                <ul className="mb-3 mt-1 max-h-44 overflow-y-auto rounded-lg border border-border">
                  {(recipes?.items ?? []).map((recipe) => (
                    <li key={recipe.id}>
                      <button
                        onClick={() => {
                          setRecipeId(recipe.id);
                          setRecipeTitle(recipe.title);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-warm"
                      >
                        {recipe.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <label className="block">
              <span className={label}>Kolik porcí jsi snědl(a)</span>
              <input
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                inputMode="decimal"
                className={input}
              />
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Každý si zapisuje své porce — 1 porce a 1,5 porce dají jiné
              hodnoty.
            </p>
          </>
        )}

        {mode === "food" && (
          <>
            {foodId ? (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-accent-green bg-surface-warm px-3 py-2 text-sm">
                <span>{foodTitle}</span>
                <button
                  onClick={() => {
                    setFoodId(null);
                    setFoodTitle(null);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  změnit
                </button>
              </div>
            ) : (
              <>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat potravinu…"
                  className={input}
                />
                <ul className="mb-3 mt-1 max-h-44 overflow-y-auto rounded-lg border border-border">
                  {(foods?.items ?? []).map((food) => (
                    <li key={food.id}>
                      <button
                        onClick={() => {
                          setFoodId(food.id);
                          setFoodTitle(food.name);
                          setUnit(
                            food.referenceUnit === "100ml"
                              ? "ml"
                              : food.referenceUnit === "piece"
                                ? "ks"
                                : "g",
                          );
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-warm"
                      >
                        {food.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={label}>Množství</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className={input}
                />
              </label>
              <label>
                <span className={label}>Jednotka</span>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className={input}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u as Unit]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        {mode === "manual" && (
          <>
            <label className="block">
              <span className={label}>Co to bylo</span>
              <input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Oběd v restauraci, croissant z pekárny…"
                className={input}
              />
            </label>
            <p className="mb-2 mt-3 text-xs text-muted-foreground">
              Vyplň, co víš. Co necháš prázdné, se nikam nezapočítá —
              nedosazujeme nuly.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {NUTRIENT_KEYS.map((key) => (
                <label key={key}>
                  <span className={label}>
                    {NUTRIENT_LABELS[key]} ({NUTRIENT_UNITS[key]})
                  </span>
                  <input
                    value={manualValues[key] ?? ""}
                    onChange={(e) =>
                      setManualValues((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    inputMode="decimal"
                    className={input}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => payload && onSave(payload)}
            disabled={!payload}
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
          >
            Zapsat
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-5 py-2.5 font-medium min-h-11"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
