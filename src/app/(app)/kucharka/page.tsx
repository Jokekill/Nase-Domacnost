"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { apiFetch } from "@/lib/api/client";
import type { RecipeListResponse } from "@/lib/recipes/types";

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
  const query = useDebounced(q, 300);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["recipes", query],
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
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
        <Link
          href="/kucharka/novy"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-11 inline-flex items-center"
        >
          + Přidat recept
        </Link>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Hledat recept… (bez diakritiky, toleruje překlepy)"
        className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
      />

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
            {items.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
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
