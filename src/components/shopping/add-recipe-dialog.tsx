"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { useDialog } from "@/components/dialog";
import { apiFetch } from "@/lib/api/client";
import { addDays, formatRange, startOfWeek, toDateKey } from "@/lib/dates";

type ShoppingListSummary = {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  checked: number;
};

const NEW_LIST = "__new__";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium";

/**
 * "Do nákupu" from a recipe: ask how many servings, pick the list, let the
 * server scale and merge the ingredients (the same import the shopping list
 * screen uses, §6.5 — so quantities top up instead of duplicating).
 *
 * The servings question is the point of the dialog: scaling happens on the
 * ingredients that go into the list, not afterwards on the list itself.
 */
export function AddRecipeToListDialog({
  recipeId,
  recipeTitle,
  baseServings,
  defaultServings,
  onClose,
  onDone,
}: {
  recipeId: string;
  recipeTitle: string;
  baseServings: number;
  /** What the detail page currently shows, so the stepper value carries over. */
  defaultServings?: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const dialog = useDialog(onClose);
  const queryClient = useQueryClient();
  const [servings, setServings] = useState(defaultServings ?? baseServings);
  const [listId, setListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shopping-lists"],
    queryFn: () =>
      apiFetch<{ items: ShoppingListSummary[] }>("/api/shopping-lists"),
  });
  const lists = data?.items ?? [];
  // Newest first already (the endpoint orders by period), so the list the
  // household is shopping from right now is the default.
  const selected = listId ?? lists[0]?.id ?? NEW_LIST;

  const add = useMutation({
    mutationFn: async () => {
      let targetId = selected;
      if (targetId === NEW_LIST) {
        const from = startOfWeek(new Date());
        const to = addDays(from, 6);
        targetId = uuidv7();
        await apiFetch("/api/shopping-lists", {
          method: "POST",
          json: {
            id: targetId,
            name: `Nákup ${formatRange(from, to)}`,
            periodStart: toDateKey(from),
            periodEnd: toDateKey(to),
          },
        });
      }
      const result = await apiFetch<{ added: number; merged: number }>(
        `/api/shopping-lists/${targetId}/import`,
        { method: "POST", json: { recipeId, servings } },
      );
      return { ...result, targetId };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      await queryClient.invalidateQueries({
        queryKey: ["shopping-list", result.targetId],
      });
      onDone(
        `Přidáno do nákupu: ${result.added} položek, ${result.merged} sloučeno s existujícími.`,
      );
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      {...dialog.backdropProps}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-card bg-surface p-4 shadow-pop sm:rounded-card"
        {...dialog.panelProps}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={dialog.titleId} className="text-lg font-semibold">
            Do nákupního seznamu
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm min-h-11"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          {recipeTitle} — recept je na {baseServings} porcí.
        </p>

        <div className="space-y-3">
          <div>
            <span className={label}>Kolik porcí vaříš?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setServings((n) => Math.max(1, n - 1))}
                className="h-11 w-11 select-none rounded-lg border border-border text-xl hover:bg-surface-warm"
                aria-label="Méně porcí"
              >
                −
              </button>
              <span className="min-w-20 select-none text-center text-sm font-medium">
                {servings} porcí
              </span>
              <button
                type="button"
                onClick={() => setServings((n) => Math.min(200, n + 1))}
                className="h-11 w-11 select-none rounded-lg border border-border text-xl hover:bg-surface-warm"
                aria-label="Více porcí"
              >
                +
              </button>
              {servings !== baseServings && (
                <button
                  type="button"
                  onClick={() => setServings(baseServings)}
                  className="min-h-11 text-sm text-primary hover:underline"
                >
                  původní ({baseServings})
                </button>
              )}
            </div>
            {servings !== baseServings && (
              <p className="mt-1 text-xs text-muted-foreground">
                Množství se přepočítá na {servings} porcí. Koření se
                nepřepočítává.
              </p>
            )}
          </div>

          <label>
            <span className={label}>Do kterého seznamu</span>
            <select
              value={selected}
              onChange={(e) => setListId(e.target.value)}
              disabled={isLoading}
              className={input}
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.checked}/{list.total})
                </option>
              ))}
              <option value={NEW_LIST}>+ Nový seznam na tento týden</option>
            </select>
          </label>
        </div>

        {error && (
          <p role="status" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              setError(null);
              add.mutate();
            }}
            disabled={add.isPending || isLoading}
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
          >
            {add.isPending ? "Přidávám…" : "🛒 Přidat do nákupu"}
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
