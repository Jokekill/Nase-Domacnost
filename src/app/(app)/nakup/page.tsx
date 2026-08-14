"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { EmptyState } from "@/components/empty-state";
import { OfflineNotice } from "@/components/offline-notice";
import { apiFetch } from "@/lib/api/client";
import { addDays, formatRange, startOfWeek, toDateKey } from "@/lib/dates";
import { readShoppingListsFromMirror } from "@/lib/offline/reads";

type ShoppingListSummary = {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  checked: number;
};

export default function ShoppingPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["shopping-lists"],
    // Without this the shop scenario dead-ends here: the detail reads from the
    // mirror, but there would be nothing to tap (docs/SYNC.md §6).
    queryFn: async () => {
      try {
        return await apiFetch<{ items: ShoppingListSummary[] }>(
          "/api/shopping-lists",
        );
      } catch (err) {
        const mirrored = await readShoppingListsFromMirror().catch(() => null);
        if (mirrored) return { ...mirrored, offline: true };
        throw err;
      }
    },
  });

  const create = useMutation({
    mutationFn: ({
      name,
      from,
      to,
    }: {
      name: string;
      from: string;
      to: string;
    }) =>
      apiFetch<{ id: string }>("/api/shopping-lists", {
        method: "POST",
        json: { id: uuidv7(), name, periodStart: from, periodEnd: to },
      }),
    onSuccess: async () => {
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  });

  const lists = data?.items ?? [];
  const offline = (data as { offline?: boolean } | undefined)?.offline === true;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">Nákup</h1>
        {!offline && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
          >
            + Nový seznam
          </button>
        )}
      </div>

      {offline && (
        <OfflineNotice>Nový seznam se dá založit až online.</OfflineNotice>
      )}

      {creating && (
        <NewListForm
          onCancel={() => setCreating(false)}
          onCreate={(values) => create.mutate(values)}
        />
      )}

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Načítám…</p>
      ) : lists.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Zatím žádné nákupní seznamy"
          description="Založ seznam na týden a naplň ho z jídelníčku nebo z receptu."
        />
      ) : (
        <ul className="space-y-2">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/nakup/${list.id}`}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
              >
                <span>
                  <span className="font-display text-lg font-semibold">
                    {list.name}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {formatRange(
                      new Date(`${list.periodStart}T00:00:00`),
                      new Date(`${list.periodEnd}T00:00:00`),
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {list.checked}/{list.total}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewListForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (values: { name: string; from: string; to: string }) => void;
}) {
  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 6);
  const [from, setFrom] = useState(toDateKey(weekStart));
  const [to, setTo] = useState(toDateKey(weekEnd));
  const [name, setName] = useState(`Nákup ${formatRange(weekStart, weekEnd)}`);

  const input =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mb-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-3">
          <span className="mb-1 block text-xs font-medium">Název</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium">Od</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={input}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium">Do</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={input}
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onCreate({ name: name.trim(), from, to })}
          disabled={!name.trim() || to < from}
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
        >
          Vytvořit
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-5 py-2 font-medium min-h-11"
        >
          Zrušit
        </button>
      </div>
    </div>
  );
}
