"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/recipes/types";

export type RecipeFilters = {
  categoryId?: string;
  tagIds: string[];
  difficulty?: Difficulty;
  maxTotalTime?: number;
  includeFoodCategoryId?: string;
  excludeFoodCategoryId?: string;
};

export const EMPTY_FILTERS: RecipeFilters = { tagIds: [] };

type NamedItem = { id: string; name: string; parentId?: string | null };

const selectCls =
  "w-full rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function FilterPanel({
  filters,
  onChange,
}: {
  filters: RecipeFilters;
  onChange: (f: RecipeFilters) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ items: NamedItem[] }>("/api/categories"),
  });
  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: () => apiFetch<{ items: NamedItem[] }>("/api/tags"),
  });
  const { data: foodCategories } = useQuery({
    queryKey: ["food-categories"],
    queryFn: () => apiFetch<{ items: NamedItem[] }>("/api/food-categories"),
  });

  const nameOf = (items: NamedItem[] | undefined, id: string | undefined) =>
    items?.find((i) => i.id === id)?.name;

  const chips: { label: string; clear: () => void }[] = [];
  if (filters.categoryId) {
    chips.push({
      label: `kategorie: ${nameOf(categories?.items, filters.categoryId)}`,
      clear: () => onChange({ ...filters, categoryId: undefined }),
    });
  }
  for (const tagId of filters.tagIds) {
    chips.push({
      label: `#${nameOf(tags?.items, tagId) ?? "tag"}`,
      clear: () =>
        onChange({
          ...filters,
          tagIds: filters.tagIds.filter((t) => t !== tagId),
        }),
    });
  }
  if (filters.difficulty) {
    chips.push({
      label: DIFFICULTY_LABELS[filters.difficulty],
      clear: () => onChange({ ...filters, difficulty: undefined }),
    });
  }
  if (filters.maxTotalTime) {
    chips.push({
      label: `do ${filters.maxTotalTime} min`,
      clear: () => onChange({ ...filters, maxTotalTime: undefined }),
    });
  }
  if (filters.includeFoodCategoryId) {
    chips.push({
      label: `s: ${nameOf(foodCategories?.items, filters.includeFoodCategoryId)}`,
      clear: () => onChange({ ...filters, includeFoodCategoryId: undefined }),
    });
  }
  if (filters.excludeFoodCategoryId) {
    chips.push({
      label: `bez: ${nameOf(foodCategories?.items, filters.excludeFoodCategoryId)}`,
      clear: () => onChange({ ...filters, excludeFoodCategoryId: undefined }),
    });
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium min-h-11 ${
            open || chips.length
              ? "border-primary text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          ⚙︎ Filtry{chips.length ? ` (${chips.length})` : ""}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={chip.clear}
            className="inline-flex items-center gap-1 rounded-full bg-surface-warm px-3 py-1 text-sm text-primary"
            title="Odebrat filtr"
          >
            {chip.label} ✕
          </button>
        ))}
        {chips.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            zrušit vše
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Kategorie receptu</span>
            <select
              value={filters.categoryId ?? ""}
              onChange={(e) =>
                onChange({ ...filters, categoryId: e.target.value || undefined })
              }
              className={selectCls}
            >
              <option value="">— všechny —</option>
              {(categories?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "– " : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Obtížnost</span>
            <select
              value={filters.difficulty ?? ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  difficulty: (e.target.value || undefined) as
                    | Difficulty
                    | undefined,
                })
              }
              className={selectCls}
            >
              <option value="">— libovolná —</option>
              {Object.entries(DIFFICULTY_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Celkový čas do (min)</span>
            <input
              type="number"
              min={5}
              step={5}
              value={filters.maxTotalTime ?? ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  maxTotalTime: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              className={selectCls}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Obsahuje skupinu potravin
            </span>
            <select
              value={filters.includeFoodCategoryId ?? ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  includeFoodCategoryId: e.target.value || undefined,
                })
              }
              className={selectCls}
            >
              <option value="">— nerozhoduje —</option>
              {(foodCategories?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "– " : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Neobsahuje skupinu potravin
            </span>
            <select
              value={filters.excludeFoodCategoryId ?? ""}
              onChange={(e) =>
                onChange({
                  ...filters,
                  excludeFoodCategoryId: e.target.value || undefined,
                })
              }
              className={selectCls}
            >
              <option value="">— nerozhoduje —</option>
              {(foodCategories?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "– " : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {(tags?.items ?? []).length > 0 && (
            <div className="text-sm sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block font-medium">Tagy</span>
              <div className="flex flex-wrap gap-1.5">
                {(tags?.items ?? []).map((t) => {
                  const selected = filters.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...filters,
                          tagIds: selected
                            ? filters.tagIds.filter((id) => id !== t.id)
                            : [...filters.tagIds, t.id],
                        })
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-sm ${
                        selected
                          ? "border-primary bg-surface-warm text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      #{t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
