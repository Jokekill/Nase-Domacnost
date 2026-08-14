"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { addDays, formatRange, startOfWeek, toDateKey } from "@/lib/dates";
import { formatInterval } from "@/lib/domain/task-suggestions";

type Template = {
  id: string;
  name: string;
  intervalDays: number | null;
  templateGroupId: string | null;
  groupName: string | null;
  lastCompletedAt: string | null;
};
type TaskList = { id: string; name: string };

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium";

/**
 * The cleanup flow from zadání §10.5, in the order the user thinks:
 * 1. period → 2. pick from templates → 3. add custom → 4. assign (afterwards).
 */
export function CleanupWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (createdIds: string[]) => void;
}) {
  const weekStart = startOfWeek(new Date());
  const [periodStart, setPeriodStart] = useState(toDateKey(weekStart));
  const [periodEnd, setPeriodEnd] = useState(toDateKey(addDays(weekStart, 6)));
  const [listId, setListId] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: lists } = useQuery({
    queryKey: ["task-lists"],
    queryFn: () => apiFetch<{ items: TaskList[] }>("/api/task-lists"),
  });
  const { data: templates } = useQuery({
    queryKey: ["task-templates"],
    queryFn: () => apiFetch<{ items: Template[] }>("/api/task-templates"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ created: string[] }>("/api/tasks", {
        method: "POST",
        json: {
          taskListId: listId || null,
          periodStart,
          periodEnd,
          templateIds: selected,
          customNames,
        },
      }),
    onSuccess: (result) => onCreated(result.created),
    onError: (err) => setError(err.message),
  });

  // Group templates by their template group ("Týdenní úklid", "Velký úklid"…)
  const groups = new Map<string, { name: string; items: Template[] }>();
  for (const template of templates?.items ?? []) {
    const key = template.templateGroupId ?? "none";
    if (!groups.has(key)) {
      groups.set(key, {
        name: template.groupName ?? "Bez skupiny",
        items: [],
      });
    }
    groups.get(key)!.items.push(template);
  }

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const totalPicked = selected.length + customNames.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-4 shadow-pop sm:rounded-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nový úklid</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm min-h-11"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Vyber období a úkoly. Přiřazovat lidem budeš až potom.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={label}>Od</span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>Do</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className={input}
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className={label}>Seznam</span>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className={input}
          >
            <option value="">— bez seznamu —</option>
            {(lists?.items ?? []).map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>

        <h3 className="mb-2 mt-4 text-sm font-semibold">Úkoly ze šablon</h3>
        {[...groups.values()].map((group) => (
          <div key={group.name} className="mb-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {group.name}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((template) => (
                <li key={template.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-warm">
                    <input
                      type="checkbox"
                      checked={selected.includes(template.id)}
                      onChange={() => toggle(template.id)}
                      className="h-5 w-5"
                    />
                    <span className="grow">{template.name}</span>
                    {template.intervalDays && (
                      <span className="text-xs text-muted-foreground">
                        {formatInterval(template.intervalDays)}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {(templates?.items ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            Zatím nemáš žádné šablony — přidej si je v Nastavení, nebo napiš
            úkoly ručně níž.
          </p>
        )}

        <h3 className="mb-2 mt-4 text-sm font-semibold">Vlastní úkoly</h3>
        <div className="flex gap-2">
          <input
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customDraft.trim()) {
                e.preventDefault();
                setCustomNames((prev) => [...prev, customDraft.trim()]);
                setCustomDraft("");
              }
            }}
            placeholder="Vyčistit kávovar…"
            className={input}
          />
          <button
            type="button"
            onClick={() => {
              if (customDraft.trim()) {
                setCustomNames((prev) => [...prev, customDraft.trim()]);
                setCustomDraft("");
              }
            }}
            className="shrink-0 rounded-lg border border-border px-4 text-sm min-h-11"
          >
            Přidat
          </button>
        </div>
        {customNames.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {customNames.map((name, index) => (
              <li key={index}>
                <button
                  onClick={() =>
                    setCustomNames((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="rounded-full bg-surface-warm px-3 py-1 text-sm text-primary"
                >
                  {name} ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => create.mutate()}
            disabled={totalPicked === 0 || create.isPending}
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
          >
            Vytvořit {totalPicked > 0 ? `(${totalPicked})` : ""}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-5 py-2.5 font-medium min-h-11"
          >
            Zrušit
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Období: {formatRange(
            new Date(`${periodStart}T00:00:00`),
            new Date(`${periodEnd}T00:00:00`),
          )}
        </p>
      </div>
    </div>
  );
}
