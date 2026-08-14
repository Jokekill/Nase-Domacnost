"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import {
  EMPTY_FILTERS,
  FilterPanel,
  type RecipeFilters,
} from "@/components/recipes/filter-panel";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { apiFetch } from "@/lib/api/client";
import type { RecipeListResponse } from "@/lib/recipes/types";

/**
 * Selection bar for the printable cookbook (§9.1). The PDF is streamed as an
 * attachment, so it is downloaded via a blob rather than a plain link.
 */
function PdfBar({
  items,
  selected,
  onToggleAll,
  onDone,
}: {
  items: { id: string }[];
  selected: Set<string>;
  onToggleAll: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pdf/cookbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeIds: [...selected] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "PDF se nepodařilo vytvořit.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kucharka-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card bg-surface-warm p-3">
      <span className="text-sm">
        Vyber recepty do tisknutelné kuchařky (bez nutričních hodnot).
      </span>
      <button
        type="button"
        onClick={onToggleAll}
        className="rounded-lg border border-border px-3 py-2 text-sm min-h-11"
      >
        {selected.size === items.length ? "Zrušit výběr" : "Vybrat vše"}
      </button>
      <button
        type="button"
        onClick={download}
        disabled={selected.size === 0 || busy}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 min-h-11"
      >
        {busy ? "Připravuji…" : `Stáhnout PDF (${selected.size})`}
      </button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function CookbookPage() {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS);
  const [pdfMode, setPdfMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const query = useDebounced(q, 300);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["recipes", query, filters],
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (filters.categoryId) params.set("categoryId", filters.categoryId);
        for (const tagId of filters.tagIds) params.append("tagId", tagId);
        if (filters.difficulty) params.set("difficulty", filters.difficulty);
        if (filters.maxTotalTime)
          params.set("maxTotalTime", String(filters.maxTotalTime));
        if (filters.includeFoodCategoryId)
          params.set("includeFoodCategoryId", filters.includeFoodCategoryId);
        if (filters.excludeFoodCategoryId)
          params.set("excludeFoodCategoryId", filters.excludeFoodCategoryId);
        if (pageParam) params.set("cursor", pageParam);
        return apiFetch<RecipeListResponse>(`/api/recipes?${params}`);
      },
      initialPageParam: "",
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Kuchařka</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPdfMode((v) => !v)}
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm min-h-11"
          >
            {pdfMode ? "Zrušit výběr" : "🖨 PDF"}
          </button>
          <Link
            href="/kucharka/import"
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm min-h-11"
          >
            ⬆︎ Import
          </Link>
          <Link
            href="/kucharka/novy"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-11"
          >
            + Přidat recept
          </Link>
        </div>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Hledat recept… (bez diakritiky, toleruje překlepy)"
        className="mb-3 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
      />

      <FilterPanel filters={filters} onChange={setFilters} />

      {pdfMode && (
        <PdfBar
          items={items}
          selected={selected}
          onToggleAll={() =>
            setSelected(
              selected.size === items.length
                ? new Set()
                : new Set(items.map((i) => i.id)),
            )
          }
          onDone={() => {
            setPdfMode(false);
            setSelected(new Set());
          }}
        />
      )}

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Načítám…</p>
      ) : items.length === 0 ? (
        query ? (
          <EmptyState
            icon="🔍"
            title="Nic nenalezeno"
            description={`Pro „${query}“ nemáme žádný recept.`}
          />
        ) : (
          <EmptyState
            icon="🥘"
            title="Zatím žádné recepty"
            description="Začni tlačítkem „Přidat recept“ vpravo nahoře."
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((r) =>
              pdfMode ? (
                <label
                  key={r.id}
                  className="relative block cursor-pointer rounded-card ring-primary has-[:checked]:ring-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setSelected(next);
                    }}
                    className="absolute left-3 top-3 z-10 h-6 w-6 accent-primary"
                  />
                  {/* Selection mode: the card must not navigate away. */}
                  <div className="pointer-events-none">
                    <RecipeCard recipe={r} />
                  </div>
                </label>
              ) : (
                <RecipeCard key={r.id} recipe={r} />
              ),
            )}
          </div>
          {hasNextPage && (
            <div className="mt-6 text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded-lg border border-border px-6 py-2.5 font-medium hover:bg-surface-warm min-h-11"
              >
                {isFetchingNextPage ? "Načítám…" : "Načíst další"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
