"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { OfflineNotice } from "@/components/offline-notice";
import { apiFetch } from "@/lib/api/client";
import { formatRange } from "@/lib/dates";
import { formatScaled } from "@/lib/domain/servings";
import { checkShoppingItem } from "@/lib/offline/mutations";
import { readShoppingListFromMirror } from "@/lib/offline/reads";
import { UNIT_LABELS, type Unit } from "@/lib/recipes/types";
import type { RecipeListResponse } from "@/lib/recipes/types";

type Source = {
  label: string;
  amount: number | null;
  unit: string | null;
  recipeId: string | null;
};
type Item = {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  storeSectionId: string | null;
  storeSectionName: string | null;
  storeSectionOrder: number | null;
  isChecked: boolean;
  checkedByName: string | null;
  sources: Source[];
};
type ListDetail = {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  items: Item[];
};

const unitLabel = (unit: string | null) =>
  unit ? (UNIT_LABELS[unit as Unit] ?? unit) : "";

export default function ShoppingListPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [openSources, setOpenSources] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ["shopping-list", id],
    // In a shop with no signal the list must still be there: fall back to the
    // local mirror (docs/SYNC.md §6, priority 2).
    queryFn: async () => {
      try {
        return await apiFetch<ListDetail>(`/api/shopping-lists/${id}`);
      } catch (err) {
        const mirrored = await readShoppingListFromMirror(id).catch(() => null);
        if (mirrored) return mirrored as unknown as ListDetail;
        throw err;
      }
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["shopping-list", id] });

  const toggle = useMutation({
    // Ticking goes through the outbox, online or not: it is THE offline
    // scenario (docs/SYNC.md §6) and the outbox is idempotent, so a flaky
    // shop wifi cannot lose or double-apply a tick.
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      checkShoppingItem(itemId, checked),
    // Optimistic: ticking things off in a shop must feel instant.
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["shopping-list", id] });
      const previous = queryClient.getQueryData<ListDetail>([
        "shopping-list",
        id,
      ]);
      queryClient.setQueryData<ListDetail>(["shopping-list", id], (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.id === itemId ? { ...item, isChecked: checked } : item,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["shopping-list", id], context.previous);
      }
    },
    onSettled: invalidate,
  });

  const addItem = useMutation({
    mutationFn: (text: string) =>
      apiFetch(`/api/shopping-lists/${id}/items`, {
        method: "POST",
        json: { id: uuidv7(), freeText: text },
      }),
    onSuccess: async () => {
      setNewItem("");
      await invalidate();
    },
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/shopping-items/${itemId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  if (isLoading || !list) {
    return <p className="py-16 text-center text-muted-foreground">Načítám…</p>;
  }

  const offline = (list as { offline?: boolean }).offline === true;
  const open = list.items.filter((i) => !i.isChecked);
  const done = list.items.filter((i) => i.isChecked);

  // Group open items by store section, keeping the shop-walk order.
  const sections = new Map<
    string,
    { name: string; order: number; items: Item[] }
  >();
  for (const item of open) {
    const key = item.storeSectionId ?? "none";
    if (!sections.has(key)) {
      sections.set(key, {
        name: item.storeSectionName ?? "Ostatní",
        order: item.storeSectionOrder ?? 999,
        items: [],
      });
    }
    sections.get(key)!.items.push(item);
  }
  const orderedSections = [...sections.values()].sort(
    (a, b) => a.order - b.order,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-semibold">{list.name}</h1>
          <p className="text-muted-foreground">
            {formatRange(
              new Date(`${list.periodStart}T00:00:00`),
              new Date(`${list.periodEnd}T00:00:00`),
            )}{" "}
            · {done.length}/{list.items.length} hotovo
          </p>
        </div>
        <div className="flex gap-2">
          {/* Filling the list pulls from recipes and the meal plan — server
              work, so it waits for the network. Ticking does not (D-025). */}
          {!offline && (
            <button
              onClick={() => setShowImport(!showImport)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm min-h-11"
            >
              ⬇︎ Naplnit
            </button>
          )}
          <Link
            href="/nakup"
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm min-h-11"
          >
            ← Seznamy
          </Link>
        </div>
      </div>

      {showImport && (
        <ImportPanel
          listId={id}
          periodStart={list.periodStart}
          periodEnd={list.periodEnd}
          onDone={async (msg) => {
            setMessage(msg);
            setShowImport(false);
            await invalidate();
          }}
        />
      )}
      {message && (
        <p className="mb-3 rounded-lg bg-surface-warm p-2.5 text-sm">
          {message}
        </p>
      )}

      {offline && (
        <OfflineNotice>
          Odškrtávání se uloží do fronty a odešle se po připojení. Přidávat a
          mazat položky jde jen online.
        </OfflineNotice>
      )}

      {!offline && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newItem.trim()) addItem.mutate(newItem.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Přidat položku…"
            className="grow rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground min-h-11"
          >
            Přidat
          </button>
        </form>
      )}

      {orderedSections.map((section) => (
        <section key={section.name} className="mb-4">
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
            {section.name}
          </h2>
          <ul className="overflow-hidden rounded-card border border-border bg-surface">
            {section.items.map((item) => (
              <li
                key={item.id}
                className="border-b border-border/60 last:border-0"
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <button
                    onClick={() =>
                      toggle.mutate({ itemId: item.id, checked: true })
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-border hover:border-accent-green"
                    aria-label={`Odškrtnout ${item.name}`}
                  >
                    <span className="h-5 w-5 rounded" />
                  </button>
                  <span className="grow">
                    {item.name}
                    {item.note && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({item.note})
                      </span>
                    )}
                    {item.sources.length > 0 && (
                      <button
                        onClick={() =>
                          setOpenSources(
                            openSources === item.id ? null : item.id,
                          )
                        }
                        className="ml-2 text-xs text-primary hover:underline"
                      >
                        {item.sources.length}× zdroj
                      </button>
                    )}
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatScaled(item.amount)} {unitLabel(item.unit)}
                  </span>
                  {!offline && (
                    <button
                      onClick={() => removeItem.mutate(item.id)}
                      className="shrink-0 px-1 text-muted-foreground hover:text-destructive"
                      aria-label="Odebrat"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {openSources === item.id && (
                  <ul className="bg-surface-warm px-4 py-2 text-xs">
                    {item.sources.map((source, index) => (
                      <li key={index} className="py-0.5">
                        {source.recipeId ? (
                          <Link
                            href={`/kucharka/${source.recipeId}`}
                            className="text-primary hover:underline"
                          >
                            {source.label}
                          </Link>
                        ) : (
                          source.label
                        )}
                        {source.amount != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {formatScaled(source.amount)}{" "}
                            {unitLabel(source.unit)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {open.length === 0 && list.items.length > 0 && (
        <p className="rounded-card border border-border bg-surface p-4 text-center">
          🎉 Všechno nakoupeno!
        </p>
      )}

      {done.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
            Nakoupeno ({done.length})
          </h2>
          <ul className="overflow-hidden rounded-card border border-border bg-surface">
            {done.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0"
              >
                <button
                  onClick={() =>
                    toggle.mutate({ itemId: item.id, checked: false })
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-accent-green bg-accent-green/20"
                  aria-label={`Vrátit ${item.name}`}
                >
                  ✓
                </button>
                <span className="grow text-muted-foreground line-through">
                  {item.name}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {formatScaled(item.amount)} {unitLabel(item.unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.items.length === 0 && (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Seznam je prázdný. Naplň ho z jídelníčku nebo receptu tlačítkem
          „Naplnit“, nebo přidej položky ručně.
        </p>
      )}
    </div>
  );
}

function ImportPanel({
  listId,
  periodStart,
  periodEnd,
  onDone,
}: {
  listId: string;
  periodStart: string;
  periodEnd: string;
  onDone: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: recipes } = useQuery({
    queryKey: ["recipes", search],
    queryFn: () =>
      apiFetch<RecipeListResponse>(
        `/api/recipes?limit=6&q=${encodeURIComponent(search)}`,
      ),
    enabled: search.trim().length > 0,
  });

  const runImport = useMutation({
    mutationFn: (json: unknown) =>
      apiFetch<{ added: number; merged: number }>(
        `/api/shopping-lists/${listId}/import`,
        { method: "POST", json },
      ),
    onSuccess: (result) =>
      onDone(
        `Přidáno ${result.added} položek, ${result.merged} sloučeno s existujícími.`,
      ),
    onError: (err) => setError(err.message),
  });

  return (
    <div className="mb-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-2 font-semibold">Naplnit seznam</h2>
      <button
        onClick={() =>
          runImport.mutate({ mealPlanFrom: periodStart, mealPlanTo: periodEnd })
        }
        disabled={runImport.isPending}
        className="mb-3 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
      >
        📅 Z jídelníčku za toto období
      </button>
      <p className="mb-2 text-xs text-muted-foreground">
        …nebo přidej ingredience jednoho receptu:
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Hledat recept…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {search.trim() && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border">
          {(recipes?.items ?? []).map((recipe) => (
            <li key={recipe.id}>
              <button
                onClick={() => runImport.mutate({ recipeId: recipe.id })}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-warm"
              >
                {recipe.title}{" "}
                <span className="text-muted-foreground">
                  ({recipe.baseServings} porcí)
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
