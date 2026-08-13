"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import {
  MealEntryDialog,
  type MealEntryDraft,
} from "@/components/planning/meal-entry-dialog";
import { apiFetch } from "@/lib/api/client";
import {
  addDays,
  formatDayLabel,
  formatRange,
  isToday,
  startOfWeek,
  toDateKey,
} from "@/lib/dates";

type MealEntry = {
  id: string;
  date: string;
  mealTypeId: string;
  mealTypeName: string;
  mealTypeOrder: number;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeBaseServings: number | null;
  freeText: string | null;
  servings: number | null;
  preparedBy: string | null;
  preparedByName: string | null;
  photoKey: string | null;
};

type PrepSuggestion = {
  id: string;
  status: "suggested" | "accepted" | "dismissed";
  suggestedFor: string;
  description: string;
  leadTimeHours: number;
  mealDate: string;
  recipeTitle: string | null;
};

export default function MealPlanPage() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [draft, setDraft] = useState<MealEntryDraft | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = toDateKey(days[0]);
  const to = toDateKey(days[6]);

  const { data: mealTypes } = useQuery({
    queryKey: ["meal-types"],
    queryFn: () =>
      apiFetch<{ items: { id: string; name: string; sortOrder: number }[] }>(
        "/api/meal-types",
      ),
  });
  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: () =>
      apiFetch<{ items: { userId: string; displayName: string }[] }>(
        "/api/household/members",
      ),
  });
  const { data: plan } = useQuery({
    queryKey: ["meal-plan", from, to],
    queryFn: () =>
      apiFetch<{ items: MealEntry[] }>(`/api/meal-plan?from=${from}&to=${to}`),
  });
  const { data: suggestions } = useQuery({
    queryKey: ["prep-suggestions", from, to],
    queryFn: () =>
      apiFetch<{ items: PrepSuggestion[] }>(
        `/api/prep-suggestions?from=${from}&to=${to}`,
      ),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["meal-plan"] });
    await queryClient.invalidateQueries({ queryKey: ["prep-suggestions"] });
    await queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  const save = useMutation({
    mutationFn: async (value: MealEntryDraft) => {
      const payload = {
        date: value.date,
        mealTypeId: value.mealTypeId,
        recipeId: value.recipeId,
        freeText: value.recipeId ? null : value.freeText.trim() || null,
        servings: value.servings
          ? Number(value.servings.replace(",", "."))
          : null,
        preparedBy: value.preparedBy || null,
      };
      if (value.id) {
        return apiFetch(`/api/meal-plan/entries/${value.id}`, {
          method: "PATCH",
          json: payload,
        });
      }
      return apiFetch("/api/meal-plan/entries", {
        method: "POST",
        json: { ...payload, id: uuidv7(), sortOrder: 0 },
      });
    },
    onSuccess: async () => {
      setDraft(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/meal-plan/entries/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDraft(null);
      await invalidate();
    },
  });

  const decideSuggestion = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "dismiss" }) =>
      apiFetch(`/api/prep-suggestions/${id}`, {
        method: "POST",
        json: { action },
      }),
    onSuccess: invalidate,
  });

  const types = mealTypes?.items ?? [];
  const openSuggestions = (suggestions?.items ?? []).filter(
    (s) => s.status === "suggested",
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">Jídelníček</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-lg border border-border px-3 py-2 min-h-11"
            aria-label="Předchozí týden"
          >
            ←
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg border border-border px-3 py-2 text-sm min-h-11"
          >
            Tento týden
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-lg border border-border px-3 py-2 min-h-11"
            aria-label="Další týden"
          >
            →
          </button>
        </div>
      </div>

      <p className="mb-3 text-muted-foreground">
        {formatRange(days[0], days[6])}
      </p>

      {openSuggestions.length > 0 && (
        <section className="mb-4 rounded-card border border-border bg-surface-warm p-4">
          <h2 className="mb-2 font-semibold">⏳ Návrhy přípravy předem</h2>
          <ul className="space-y-2">
            {openSuggestions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  <strong>{s.description}</strong>
                  {s.recipeTitle && ` — ${s.recipeTitle}`}{" "}
                  <span className="text-muted-foreground">
                    ({new Date(`${s.suggestedFor}T00:00:00`).toLocaleDateString(
                      "cs-CZ",
                      { weekday: "long", day: "numeric", month: "numeric" },
                    )}
                    , {s.leadTimeHours} h předem)
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() =>
                      decideSuggestion.mutate({ id: s.id, action: "accept" })
                    }
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground min-h-11"
                  >
                    Přijmout
                  </button>
                  <button
                    onClick={() =>
                      decideSuggestion.mutate({ id: s.id, action: "dismiss" })
                    }
                    className="rounded-lg border border-border px-3 py-1.5 text-sm min-h-11"
                  >
                    Odmítnout
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Přijatý návrh vytvoří úkol. Odmítnutý se pro tuto položku už
            nenabídne.
          </p>
        </section>
      )}

      <div className="space-y-3">
        {days.map((day) => {
          const key = toDateKey(day);
          const dayEntries = (plan?.items ?? []).filter((e) => e.date === key);
          return (
            <section
              key={key}
              className={`rounded-card border bg-surface p-3 shadow-card ${
                isToday(day) ? "border-primary" : "border-border"
              }`}
            >
              <h2 className="mb-2 font-display text-lg font-semibold">
                {formatDayLabel(day)}
                {isToday(day) && (
                  <span className="ml-2 text-sm text-primary">dnes</span>
                )}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {types.map((type) => {
                  const slotEntries = dayEntries.filter(
                    (e) => e.mealTypeId === type.id,
                  );
                  return (
                    <div key={type.id} className="rounded-lg bg-surface-warm p-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {type.name}
                      </p>
                      <ul className="space-y-1">
                        {slotEntries.map((entry) => (
                          <li key={entry.id}>
                            <button
                              onClick={() =>
                                setDraft({
                                  id: entry.id,
                                  date: entry.date,
                                  mealTypeId: entry.mealTypeId,
                                  recipeId: entry.recipeId,
                                  freeText: entry.freeText ?? "",
                                  servings:
                                    entry.servings != null
                                      ? String(entry.servings)
                                      : "",
                                  preparedBy: entry.preparedBy ?? "",
                                })
                              }
                              className="w-full rounded px-1 py-0.5 text-left text-sm hover:bg-surface"
                            >
                              {entry.recipeTitle ?? entry.freeText}
                              {entry.servings && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {entry.servings} p.
                                </span>
                              )}
                              {entry.preparedByName && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {entry.preparedByName}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() =>
                          setDraft({
                            date: key,
                            mealTypeId: type.id,
                            recipeId: null,
                            freeText: "",
                            servings: "",
                            preparedBy: "",
                          })
                        }
                        className="mt-1 w-full rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface"
                      >
                        + přidat
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {types.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Nejsou nastavené typy jídel. Přidej je v{" "}
          <Link href="/nastaveni" className="text-primary hover:underline">
            Nastavení
          </Link>
          .
        </p>
      )}

      {draft && (
        <MealEntryDialog
          draft={draft}
          mealTypes={types}
          members={members?.items ?? []}
          onClose={() => setDraft(null)}
          onSave={(value) => save.mutate(value)}
          onDelete={
            draft.id ? () => remove.mutate(draft.id as string) : undefined
          }
        />
      )}
    </div>
  );
}
