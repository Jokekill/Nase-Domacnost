"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { apiFetch } from "@/lib/api/client";
import type { CookbookChapter } from "@/lib/recipes/types";

/**
 * Chapters of the cookbook: their order, which ones show up on the front page,
 * and the names themselves (§5.1).
 *
 * Order is shared with the whole household — what Vojta arranges, Eliška sees.
 * Hiding is deliberately weak: a hidden chapter only drops off the front page,
 * its recipes stay searchable and the chapter stays available when filing a
 * recipe. Nothing here can lose a recipe.
 *
 * Arrows rather than drag & drop: dragging is miserable on a phone, and arrows
 * work from the keyboard (§11.2).
 */
export function ChapterEditor({
  chapters,
  onClose,
}: {
  chapters: CookbookChapter[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const bySortOrder = (a: CookbookChapter, b: CookbookChapter) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "cs");
  const topLevel = chapters.filter((c) => !c.parentId).sort(bySortOrder);
  const childrenOf = (id: string) =>
    chapters.filter((c) => c.parentId === id).sort(bySortOrder);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cookbook-overview"] });
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  /** Shows the change at once; the server has the last word on refresh. */
  function patchLocally(
    update: (chapters: CookbookChapter[]) => CookbookChapter[],
  ) {
    queryClient.setQueryData<{ chapters: CookbookChapter[] }>(
      ["cookbook-overview"],
      (old) => (old ? { ...old, chapters: update(old.chapters) } : old),
    );
  }

  const run = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: async (err: Error) => {
      setError(err.message);
      // The optimistic change was a guess and it was wrong — take the
      // server's version back.
      await refresh();
    },
  });

  /** Swaps a chapter with its neighbour and writes the whole new order. */
  function move(chapter: CookbookChapter, direction: -1 | 1) {
    const siblings = chapter.parentId ? childrenOf(chapter.parentId) : topLevel;
    const index = siblings.findIndex((c) => c.id === chapter.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;

    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    const order = new Map(reordered.map((c, i) => [c.id, i]));
    patchLocally((chapters) =>
      chapters.map((c) =>
        order.has(c.id) ? { ...c, sortOrder: order.get(c.id)! } : c,
      ),
    );
    run.mutate(() =>
      apiFetch("/api/categories/reorder", {
        method: "POST",
        json: {
          items: reordered.map((c, i) => ({ id: c.id, sortOrder: i })),
        },
      }),
    );
  }

  function setHidden(chapter: CookbookChapter, isHidden: boolean) {
    patchLocally((chapters) =>
      chapters.map((c) => (c.id === chapter.id ? { ...c, isHidden } : c)),
    );
    run.mutate(() =>
      apiFetch(`/api/categories/${chapter.id}`, {
        method: "PATCH",
        json: { isHidden },
      }),
    );
  }

  function rename(chapter: CookbookChapter) {
    const name = renameValue.trim();
    setRenaming(null);
    if (!name || name === chapter.name) return;
    patchLocally((chapters) =>
      chapters.map((c) => (c.id === chapter.id ? { ...c, name } : c)),
    );
    run.mutate(() =>
      apiFetch(`/api/categories/${chapter.id}`, {
        method: "PATCH",
        json: { name },
      }),
    );
  }

  function remove(chapter: CookbookChapter) {
    if (!confirm(`Opravdu smazat kapitolu „${chapter.name}“?`)) return;
    setMessage(null);
    run.mutate(() =>
      apiFetch(`/api/categories/${chapter.id}`, { method: "DELETE" }),
    );
  }

  function add() {
    const name = newName.trim();
    if (!name) return;
    const siblings = newParentId ? childrenOf(newParentId) : topLevel;
    run.mutate(async () => {
      await apiFetch("/api/categories", {
        method: "POST",
        json: {
          id: uuidv7(),
          name,
          parentId: newParentId || null,
          sortOrder: siblings.length,
        },
      });
      setNewName("");
      setMessage(`Kapitola „${name}“ přidána.`);
    });
  }

  const row = (chapter: CookbookChapter, isChild: boolean) => {
    const siblings = isChild ? childrenOf(chapter.parentId!) : topLevel;
    const index = siblings.findIndex((c) => c.id === chapter.id);

    return (
      <li
        key={chapter.id}
        className={`flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 ${
          isChild ? "pl-8" : ""
        }`}
      >
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => move(chapter, -1)}
            disabled={index === 0 || run.isPending}
            className="h-6 w-8 rounded text-xs hover:bg-surface-warm disabled:opacity-30"
            aria-label={`Posunout ${chapter.name} nahoru`}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => move(chapter, 1)}
            disabled={index === siblings.length - 1 || run.isPending}
            className="h-6 w-8 rounded text-xs hover:bg-surface-warm disabled:opacity-30"
            aria-label={`Posunout ${chapter.name} dolů`}
          >
            ▼
          </button>
        </div>

        {renaming === chapter.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => rename(chapter)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename(chapter);
              if (e.key === "Escape") setRenaming(null);
            }}
            aria-label={`Název kapitoly ${chapter.name}`}
            className="grow rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setRenaming(chapter.id);
              setRenameValue(chapter.name);
            }}
            className="grow text-left min-h-11"
            title="Klepnutím přejmenuješ"
          >
            <span className={chapter.isHidden ? "text-muted-foreground" : ""}>
              {chapter.name}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {chapter.recipeCount}
              {chapter.isHidden && " · skrytá"}
            </span>
          </button>
        )}

        <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!chapter.isHidden}
            onChange={(e) => setHidden(chapter, !e.target.checked)}
            disabled={run.isPending}
            className="h-5 w-5"
          />
          <span className="text-muted-foreground">v kuchařce</span>
        </label>

        <button
          type="button"
          onClick={() => remove(chapter)}
          disabled={run.isPending}
          className="min-h-11 shrink-0 px-2 text-muted-foreground hover:text-destructive"
          aria-label={`Smazat kapitolu ${chapter.name}`}
        >
          ✕
        </button>
      </li>
    );
  };

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Kapitoly kuchařky</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium min-h-11"
        >
          Hotovo
        </button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Pořadí i skrývání platí pro celou domácnost. Skrytá kapitola jen zmizí z
        úvodu kuchařky — recepty v ní se dál najdou hledáním i filtrem.
      </p>

      {error && (
        <p
          role="status"
          className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mb-3 rounded-lg bg-surface-warm p-2.5 text-sm"
        >
          {message}
        </p>
      )}

      <ul className="mb-4 overflow-hidden rounded-card border border-border">
        {topLevel.flatMap((chapter) => [
          row(chapter, false),
          ...childrenOf(chapter.id).map((child) => row(child, true)),
        ])}
      </ul>

      <div className="flex flex-wrap items-end gap-2">
        <label className="grow">
          <span className="mb-1 block text-xs font-medium">Nová kapitola</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Např. Fermentace"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium">Uvnitř</span>
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-11"
          >
            <option value="">— samostatná kapitola —</option>
            {topLevel.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!newName.trim() || run.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 min-h-11"
        >
          Přidat
        </button>
      </div>
    </section>
  );
}
