"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeBrowser } from "@/components/recipes/recipe-browser";
import { apiFetch } from "@/lib/api/client";
import { readCookbookOverviewFromMirror } from "@/lib/offline/reads";
import { recipeCount } from "@/lib/plural";
import type { CookbookOverview } from "@/lib/recipes/types";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** The two tiles that are not categories at all. */
const SPECIALS: Record<string, { title: string; hint: string }> = {
  vse: {
    title: "Všechny recepty",
    hint: "Celá kuchařka napříč kapitolami.",
  },
  nezarazene: {
    title: "Bez kategorie",
    hint: "Recepty, které zatím nikam nepatří. Kapitolu jim přiřadíš v úpravě receptu.",
  },
};

/**
 * One chapter of the cookbook: its recipes, including everything in its
 * subcategories, which sit on top as chips for narrowing down (§5.1).
 */
export default function ChapterPage() {
  const { id } = useParams<{ id: string }>();
  const [q, setQ] = useState("");
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const query = useDebounced(q, 300);
  const special = SPECIALS[id];

  const { data } = useQuery({
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
    enabled: !special,
  });

  const chapter = data?.chapters.find((c) => c.id === id);
  const subcategories = (data?.chapters ?? []).filter((c) => c.parentId === id);
  const title = special?.title ?? chapter?.name ?? "Kapitola";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{title}</h1>
          {special ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {special.hint}
            </p>
          ) : (
            chapter && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {recipeCount(chapter.recipeCount)} včetně podkapitol
                {chapter.isHidden && " · kapitola je skrytá z úvodu"}
              </p>
            )
          )}
        </div>
        <Link
          href="/kucharka"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm min-h-11"
        >
          ← Kapitoly
        </Link>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={special ? "Hledat recept…" : `Hledat v kapitole ${title}…`}
        className="mb-3 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
      />

      {subcategories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip
            active={subcategoryId === null}
            onClick={() => setSubcategoryId(null)}
            label={`Vše (${chapter?.recipeCount ?? 0})`}
          />
          {subcategories.map((sub) => (
            <Chip
              key={sub.id}
              active={subcategoryId === sub.id}
              onClick={() => setSubcategoryId(sub.id)}
              label={`${sub.name} (${sub.recipeCount})`}
            />
          ))}
        </div>
      )}

      <RecipeBrowser
        q={query}
        categoryId={special ? undefined : (subcategoryId ?? id)}
        uncategorised={id === "nezarazene"}
        emptyHint={
          special
            ? undefined
            : "V téhle kapitole zatím nic není. Kapitolu receptu nastavíš v jeho úpravě."
        }
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-sm min-h-11 ${
        active
          ? "border-primary bg-surface-warm text-primary"
          : "border-border text-muted-foreground hover:bg-surface-warm"
      }`}
    >
      {label}
    </button>
  );
}
