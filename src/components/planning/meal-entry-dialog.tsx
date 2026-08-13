"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { RecipeListResponse } from "@/lib/recipes/types";

export type MealEntryDraft = {
  id?: string;
  date: string;
  mealTypeId: string;
  recipeId: string | null;
  freeText: string;
  servings: string;
  preparedBy: string;
};

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium";

/** Add or edit one meal-plan slot item: a recipe or just free text (§10.1). */
export function MealEntryDialog({
  draft,
  mealTypes,
  members,
  onClose,
  onSave,
  onDelete,
}: {
  draft: MealEntryDraft;
  mealTypes: { id: string; name: string }[];
  members: { userId: string; displayName: string }[];
  onClose: () => void;
  onSave: (draft: MealEntryDraft) => void;
  onDelete?: () => void;
}) {
  const [value, setValue] = useState(draft);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

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
  });

  const set = <K extends keyof MealEntryDraft>(
    key: K,
    v: MealEntryDraft[K],
  ) => setValue((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-4 shadow-pop sm:rounded-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {draft.id ? "Upravit jídlo" : "Přidat jídlo"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm min-h-11"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={label}>Den</span>
              <input
                type="date"
                value={value.date}
                onChange={(e) => set("date", e.target.value)}
                className={input}
              />
            </label>
            <label>
              <span className={label}>Jídlo</span>
              <select
                value={value.mealTypeId}
                onChange={(e) => set("mealTypeId", e.target.value)}
                className={input}
              >
                {mealTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className={label}>Recept z kuchařky</span>
            {value.recipeId ? (
              <div className="flex items-center justify-between rounded-lg border border-accent-green bg-surface-warm px-3 py-2 text-sm">
                <span>{selectedTitle ?? "Vybraný recept"}</span>
                <button
                  onClick={() => {
                    set("recipeId", null);
                    setSelectedTitle(null);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  odebrat
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
                {search.trim() && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border">
                    {(recipes?.items ?? []).map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => {
                            set("recipeId", r.id);
                            set("freeText", "");
                            setSelectedTitle(r.title);
                            setSearch("");
                            if (!value.servings)
                              set("servings", String(r.baseServings));
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-warm"
                        >
                          {r.title}
                        </button>
                      </li>
                    ))}
                    {(recipes?.items ?? []).length === 0 && (
                      <li className="px-3 py-2 text-sm text-muted-foreground">
                        Nic nenalezeno — použij pole níž.
                      </li>
                    )}
                  </ul>
                )}
              </>
            )}
          </div>

          {!value.recipeId && (
            <label>
              <span className={label}>…nebo jen text</span>
              <input
                value={value.freeText}
                onChange={(e) => set("freeText", e.target.value)}
                placeholder="Pizza z restaurace"
                className={input}
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={label}>Počet porcí</span>
              <input
                value={value.servings}
                onChange={(e) => set("servings", e.target.value)}
                inputMode="decimal"
                placeholder="dle receptu"
                className={input}
              />
            </label>
            <label>
              <span className={label}>Kdo připravuje</span>
              <select
                value={value.preparedBy}
                onChange={(e) => set("preparedBy", e.target.value)}
                className={input}
              >
                <option value="">— nikdo —</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => onSave(value)}
            disabled={!value.recipeId && !value.freeText.trim()}
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
          >
            Uložit
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-5 py-2.5 font-medium min-h-11"
          >
            Zrušit
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="ml-auto rounded-lg border border-border px-4 py-2.5 font-medium text-destructive min-h-11"
            >
              Smazat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
