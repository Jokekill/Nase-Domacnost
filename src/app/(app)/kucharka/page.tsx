"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { OfflineNotice } from "@/components/offline-notice";
import { ChapterEditor } from "@/components/recipes/chapter-editor";
import { ChapterTile } from "@/components/recipes/chapter-tile";
import { RecipeBrowser } from "@/components/recipes/recipe-browser";
import { apiFetch } from "@/lib/api/client";
import { readCookbookOverviewFromMirror } from "@/lib/offline/reads";
import type { CookbookOverview } from "@/lib/recipes/types";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * The cookbook opens on its chapters, not on a wall of recipes (§5.1): you
 * pick where to look first, the way you would with a printed book.
 *
 * Typing in the search box skips the chapters — you cannot search inside a
 * chapter you have not found yet.
 */
export default function CookbookPage() {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const query = useDebounced(q, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["cookbook-overview"],
    queryFn: async () => {
      try {
        return await apiFetch<CookbookOverview>("/api/categories/overview");
      } catch (err) {
        const mirrored = await readCookbookOverviewFromMirror().catch(
          () => null,
        );
        if (mirrored) return { ...mirrored, offline: true } as CookbookOverview;
        throw err;
      }
    },
  });

  const offline = (data as { offline?: boolean } | undefined)?.offline === true;
  const chapters = data?.chapters ?? [];
  const topLevel = chapters.filter((c) => !c.parentId);
  const visible = topLevel.filter((c) => !c.isHidden);
  const hiddenCount = topLevel.length - visible.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Kuchařka</h1>
        <div className="flex gap-2">
          {!offline && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={`inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium min-h-11 ${
                editing ? "border-primary text-primary" : "border-border"
              }`}
            >
              {editing ? "Hotovo" : "⚙︎ Kapitoly"}
            </button>
          )}
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
        placeholder="Hledat recept v celé kuchařce… (bez diakritiky, toleruje překlepy)"
        className="mb-3 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
      />

      {query ? (
        <RecipeBrowser q={query} />
      ) : editing ? (
        <ChapterEditor chapters={chapters} onClose={() => setEditing(false)} />
      ) : (
        <>
          {offline && (
            <OfflineNotice>
              Kapitoly i počty jsou z poslední stažené kopie.
            </OfflineNotice>
          )}

          {isLoading ? (
            <p className="py-16 text-center text-muted-foreground">Načítám…</p>
          ) : (
            // Two per row even on a phone: a table of contents you scroll
            // through forever is no table of contents.
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              <ChapterTile
                href="/kucharka/kategorie/vse"
                name="Všechny recepty"
                count={data?.totalRecipes ?? 0}
                icon="📚"
              />
              {visible.map((chapter) => (
                <ChapterTile
                  key={chapter.id}
                  href={`/kucharka/kategorie/${chapter.id}`}
                  name={chapter.name}
                  count={chapter.recipeCount}
                  coverPhotoKey={chapter.coverPhotoKey}
                />
              ))}
              {(data?.uncategorisedRecipes ?? 0) > 0 && (
                <ChapterTile
                  href="/kucharka/kategorie/nezarazene"
                  name="Bez kategorie"
                  count={data!.uncategorisedRecipes}
                  icon="🗂"
                />
              )}
            </div>
          )}

          {hiddenCount > 0 && !offline && (
            <p className="mt-4 text-sm text-muted-foreground">
              {hiddenCount === 1
                ? "Jedna kapitola je skrytá"
                : `Skrytých kapitol: ${hiddenCount}`}{" "}
              — recepty v nich zůstávají dohledatelné.{" "}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-primary hover:underline"
              >
                Zobrazit nastavení kapitol
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
