"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { uuidv7 } from "uuidv7";
import { apiFetch } from "@/lib/api/client";

type Food = { id: string; name: string; foodCategoryId: string | null };
type FoodCategory = { id: string; name: string; parentId: string | null };

/**
 * Combobox: search foods by name (diacritics-insensitive), pick one, or
 * create a new food on the fly (optionally with a food group so the
 * "search by ingredient group" feature works — §5.4).
 */
export function FoodPicker({
  value,
  valueName,
  onChange,
  onTextChange,
}: {
  value: string | null;
  valueName: string | null;
  onChange: (foodId: string | null, foodName: string | null) => void;
  /** Fires as the user types — keeps plain-text ingredients in form state. */
  onTextChange: (text: string) => void;
}) {
  const [term, setTerm] = useState(valueName ?? "");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createCategoryId, setCreateCategoryId] = useState<string>("");
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const { data } = useQuery({
    queryKey: ["foods", term],
    queryFn: () =>
      apiFetch<{ items: Food[] }>(
        `/api/foods?q=${encodeURIComponent(term)}`,
      ),
    enabled: open,
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["food-categories"],
    queryFn: () => apiFetch<{ items: FoodCategory[] }>("/api/food-categories"),
    enabled: creating,
  });

  const items = data?.items ?? [];
  const exactMatch = items.some(
    (f) => f.name.toLocaleLowerCase("cs") === term.toLocaleLowerCase("cs"),
  );

  async function createFood() {
    const id = uuidv7();
    await apiFetch("/api/foods", {
      method: "POST",
      json: {
        id,
        name: term.trim(),
        foodCategoryId: createCategoryId || null,
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["foods"] });
    onChange(id, term.trim());
    setCreating(false);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
          onTextChange(e.target.value);
          if (value) onChange(null, null); // typing detaches the selected food
        }}
        onFocus={() => setOpen(true)}
        placeholder="Surovina (např. hladká mouka)"
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring bg-background ${
          value ? "border-accent-green" : "border-border"
        }`}
      />
      {value && (
        <span
          title="Propojeno s potravinou"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-green"
        >
          ✓
        </span>
      )}
      {open && term.trim().length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-surface shadow-pop">
          {items.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onChange(f.id, f.name);
                setTerm(f.name);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-warm"
            >
              {f.name}
            </button>
          ))}
          {!exactMatch && !creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="block w-full px-3 py-2 text-left text-sm text-primary hover:bg-surface-warm"
            >
              + Vytvořit potravinu „{term.trim()}“
            </button>
          )}
          {creating && (
            <div className="space-y-2 border-t border-border p-3">
              <label className="block text-xs text-muted-foreground">
                Skupina potraviny (kvůli hledání, volitelné)
              </label>
              <select
                value={createCategoryId}
                onChange={(e) => setCreateCategoryId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— bez skupiny —</option>
                {(categoriesData?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? "– " : ""}
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={createFood}
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Vytvořit a použít
              </button>
            </div>
          )}
          {items.length === 0 && exactMatch === false && !creating && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Bez propojení s potravinou zůstane surovina jen jako text (nebude
              se počítat do nutričních hodnot ani hledání podle skupin).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
