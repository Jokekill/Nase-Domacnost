"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { AddEntryDialog } from "@/components/diary/add-entry-dialog";
import { WeeklyChart } from "@/components/diary/weekly-chart";
import { OfflineNotice } from "@/components/offline-notice";
import { apiFetch } from "@/lib/api/client";
import { deleteDiaryEntry } from "@/lib/offline/mutations";
import {
  cached,
  readDiaryFromMirror,
  readDiarySummaryFromMirror,
} from "@/lib/offline/reads";
import {
  addDays,
  formatDayLabel,
  formatRange,
  isToday,
  startOfWeek,
  toDateKey,
} from "@/lib/dates";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  formatNutrient,
  kjToKcal,
  type NutrientKey,
  type NutritionValues,
} from "@/lib/domain/nutrition";
import { formatScaled } from "@/lib/domain/servings";

type Snapshot = NutritionValues & { incomplete?: boolean; missing?: string[] };
type Entry = {
  id: string;
  date: string;
  mealTypeName: string | null;
  sourceKind: "recipe" | "food" | "manual";
  recipeId: string | null;
  title: string;
  amount: number | null;
  unit: string | null;
  nutrition: Snapshot;
};
type Summary = {
  days: { date: string; totals: NutritionValues; incomplete: boolean }[];
  averages: NutritionValues;
  daysWithData: number;
  goals: { nutrientKey: string; targetPerDay: number }[];
};
type MealPlanEntry = {
  id: string;
  date: string;
  mealTypeName: string;
  recipeTitle: string | null;
  freeText: string | null;
  servings: number | null;
};

export default function DiaryPage() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [chartNutrient, setChartNutrient] = useState<NutrientKey>("energyKj");
  const [message, setMessage] = useState<string | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = toDateKey(days[0]);
  const to = toDateKey(days[6]);

  const { data: mealTypes } = useQuery({
    queryKey: ["meal-types"],
    queryFn: () =>
      cached("meal-types", () =>
        apiFetch<{ items: { id: string; name: string }[] }>("/api/meal-types"),
      ),
  });
  // Offline both the entries and the day totals come from the mirror: the
  // snapshots are already computed numbers, summing them is the same
  // arithmetic the server does (docs/SYNC.md §6, priority 4).
  const { data: diary } = useQuery({
    queryKey: ["diary", from, to],
    queryFn: async () => {
      try {
        return await apiFetch<{ items: Entry[] }>(
          `/api/diary?from=${from}&to=${to}`,
        );
      } catch (err) {
        const mirrored = await readDiaryFromMirror(from, to).catch(() => null);
        if (mirrored) {
          return { ...mirrored, offline: true } as unknown as {
            items: Entry[];
            offline: true;
          };
        }
        throw err;
      }
    },
  });
  const { data: summary } = useQuery({
    queryKey: ["diary-summary", from, to],
    queryFn: async () => {
      try {
        return await apiFetch<Summary>(
          `/api/diary/summary?from=${from}&to=${to}`,
        );
      } catch (err) {
        const mirrored = await readDiarySummaryFromMirror(
          from,
          to,
          NUTRIENT_KEYS,
        ).catch(() => null);
        if (mirrored) return mirrored as unknown as Summary;
        throw err;
      }
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["diary"] });
    await queryClient.invalidateQueries({ queryKey: ["diary-summary"] });
  };

  const addEntry = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/diary/entries", { method: "POST", json: payload }),
    onSuccess: async () => {
      setShowAdd(false);
      await invalidate();
    },
    onError: (err) => setMessage(err.message),
  });

  const removeEntry = useMutation({
    // Deleting goes through the outbox; writing a new entry stays online-only
    // because the server computes the nutrition snapshot (D-022, D-025).
    mutationFn: (id: string) => deleteDiaryEntry(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["diary", from, to] });
      const previous = queryClient.getQueryData<{ items: Entry[] }>([
        "diary",
        from,
        to,
      ]);
      queryClient.setQueryData<{ items: Entry[] }>(
        ["diary", from, to],
        (old) =>
          old ? { ...old, items: old.items.filter((e) => e.id !== id) } : old,
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["diary", from, to], context.previous);
      }
    },
    onSuccess: invalidate,
  });

  const entries = diary?.items ?? [];
  const offline =
    (diary as { offline?: boolean } | undefined)?.offline === true;
  const goalMap = new Map(
    (summary?.goals ?? []).map((goal) => [goal.nutrientKey, goal.targetPerDay]),
  );
  const dayEntries = entries.filter((entry) => entry.date === selectedDate);
  const dayTotals =
    summary?.days.find((day) => day.date === selectedDate)?.totals ?? {};
  const dayIncomplete =
    summary?.days.find((day) => day.date === selectedDate)?.incomplete ?? false;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">Deník</h1>
        <div className="flex flex-wrap gap-2">
          {/* Everything that writes a new entry needs the server (D-022). */}
          {!offline && (
            <>
              <button
                onClick={() => setShowGoals(!showGoals)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium min-h-11"
              >
                🎯 Cíle
              </button>
              <button
                onClick={() => setShowImport(!showImport)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium min-h-11"
              >
                📅 Z jídelníčku
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
              >
                + Zapsat
              </button>
            </>
          )}
        </div>
      </div>

      {offline && (
        <OfflineNotice>
          Zapisovat nové jídlo jde jen online — hodnoty počítá server, aby
          seděly. Mazání se uloží do fronty.
        </OfflineNotice>
      )}

      {message && (
        <p className="mb-3 rounded-lg bg-surface-warm p-2.5 text-sm">
          {message}
        </p>
      )}

      {showGoals && (
        <GoalsPanel
          goals={summary?.goals ?? []}
          onSaved={async () => {
            await queryClient.invalidateQueries({
              queryKey: ["diary-summary"],
            });
          }}
        />
      )}

      {showImport && (
        <MealPlanImport
          from={from}
          to={to}
          onDone={async (msg) => {
            setShowImport(false);
            setMessage(msg);
            await invalidate();
          }}
        />
      )}

      {/* Week switcher + day picker */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="rounded-lg border border-border px-3 py-2 min-h-11"
          aria-label="Předchozí týden"
        >
          ←
        </button>
        <span className="text-sm text-muted-foreground">
          {formatRange(days[0], days[6])}
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="rounded-lg border border-border px-3 py-2 min-h-11"
          aria-label="Další týden"
        >
          →
        </button>
      </div>

      <div className="mb-4 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = toDateKey(day);
          const hasData = summary?.days.some((d) => d.date === key);
          return (
            <button
              key={key}
              onClick={() => setSelectedDate(key)}
              className={`rounded-lg border px-1 py-2 text-center text-xs min-h-14 ${
                selectedDate === key
                  ? "border-primary bg-surface-warm text-primary"
                  : isToday(day)
                    ? "border-primary/40"
                    : "border-border"
              }`}
            >
              <div>{formatDayLabel(day).split(" ")[0]}</div>
              <div className="font-medium">{day.getDate()}.</div>
              {hasData && <div className="text-accent-green">•</div>}
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      <section className="mb-4 rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">
            {formatDayLabel(new Date(`${selectedDate}T00:00:00`))}
          </h2>
          <span className="font-display text-2xl font-semibold text-primary">
            {formatNutrient("energyKj", dayTotals.energyKj)} kJ
            {dayTotals.energyKj != null && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({Math.round(kjToKcal(dayTotals.energyKj))} kcal)
              </span>
            )}
          </span>
        </div>

        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          {NUTRIENT_KEYS.filter((key) => key !== "energyKj").map((key) => {
            const goal = goalMap.get(key);
            const value = dayTotals[key];
            return (
              <div
                key={key}
                className="flex justify-between border-b border-border/60 py-1"
              >
                <dt className="text-muted-foreground">
                  {NUTRIENT_LABELS[key]}
                </dt>
                <dd className="font-medium">
                  {formatNutrient(key, value)}
                  {goal != null && (
                    <span className="text-muted-foreground">
                      {" "}
                      / {formatNutrient(key, goal)}
                    </span>
                  )}{" "}
                  {NUTRIENT_UNITS[key]}
                </dd>
              </div>
            );
          })}
        </dl>

        {goalMap.size > 0 && (
          <div className="mb-3 space-y-1">
            {[...goalMap.entries()].map(([key, target]) => {
              const value = dayTotals[key as NutrientKey] ?? 0;
              const pct = Math.min(100, Math.round((value / target) * 100));
              return (
                <div key={key} className="text-xs">
                  <div className="mb-0.5 flex justify-between">
                    <span>{NUTRIENT_LABELS[key as NutrientKey]}</span>
                    <span className="text-muted-foreground">{pct} %</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-warm">
                    <div
                      className="h-full rounded-full bg-accent-green"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {dayIncomplete && (
          <p className="mb-2 rounded-lg bg-surface-warm p-2 text-xs">
            ⚠️ U některých záznamů chybí část hodnot — souhrn není úplný.
          </p>
        )}

        {dayEntries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Na tento den zatím nic nemáš zapsané.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {dayEntries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 py-2">
                <span className="grow text-sm">
                  {entry.recipeId ? (
                    <Link
                      href={`/kucharka/${entry.recipeId}`}
                      className="font-medium hover:text-primary"
                    >
                      {entry.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{entry.title}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {entry.mealTypeName ? `${entry.mealTypeName} · ` : ""}
                    {entry.amount != null &&
                      `${formatScaled(entry.amount)} ${entry.unit ?? ""} · `}
                    {formatNutrient("energyKj", entry.nutrition.energyKj)} kJ
                    {entry.nutrition.incomplete && " ⚠️"}
                  </span>
                </span>
                <button
                  onClick={() => removeEntry.mutate(entry.id)}
                  className="shrink-0 px-2 text-muted-foreground hover:text-destructive"
                  aria-label={`Smazat ${entry.title}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Week overview */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Týdenní přehled</h2>
          <select
            value={chartNutrient}
            onChange={(e) => setChartNutrient(e.target.value as NutrientKey)}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm min-h-11"
          >
            {NUTRIENT_KEYS.map((key) => (
              <option key={key} value={key}>
                {NUTRIENT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <WeeklyChart
          days={summary?.days ?? []}
          dates={days}
          nutrient={chartNutrient}
          goal={goalMap.get(chartNutrient) ?? null}
          unit={NUTRIENT_UNITS[chartNutrient]}
        />

        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold">
            Průměr na den{" "}
            <span className="font-normal text-muted-foreground">
              (z {summary?.daysWithData ?? 0} dní se záznamy)
            </span>
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {NUTRIENT_KEYS.map((key) => (
              <div
                key={key}
                className="flex justify-between border-b border-border/60 py-1"
              >
                <dt className="text-muted-foreground">
                  {NUTRIENT_LABELS[key]}
                </dt>
                <dd className="font-medium">
                  {formatNutrient(key, summary?.averages[key])}{" "}
                  {NUTRIENT_UNITS[key]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {showAdd && (
        <AddEntryDialog
          date={selectedDate}
          mealTypes={mealTypes?.items ?? []}
          onClose={() => setShowAdd(false)}
          onSave={(payload) => addEntry.mutate(payload)}
        />
      )}
    </div>
  );
}

function GoalsPanel({
  goals,
  onSaved,
}: {
  goals: { nutrientKey: string; targetPerDay: number }[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      goals.map((g) => [g.nutrientKey, String(g.targetPerDay)]),
    ),
  );
  const [saving, setSaving] = useState(false);

  async function save(key: NutrientKey) {
    setSaving(true);
    const raw = values[key] ?? "";
    const parsed = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    await apiFetch("/api/diary/goals", {
      method: "PUT",
      json: { nutrientKey: key, targetPerDay: parsed },
    });
    await onSaved();
    setSaving(false);
  }

  return (
    <div className="mb-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-1 text-lg font-semibold">Denní cíle</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Cíle jsou tvoje osobní a nepovinné. Prázdné pole = žádný cíl.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUTRIENT_KEYS.map((key) => (
          <label key={key}>
            <span className="mb-1 block text-xs font-medium">
              {NUTRIENT_LABELS[key]} ({NUTRIENT_UNITS[key]})
            </span>
            <input
              value={values[key] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [key]: e.target.value }))
              }
              onBlur={() => save(key)}
              inputMode="decimal"
              disabled={saving}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function MealPlanImport({
  from,
  to,
  onDone,
}: {
  from: string;
  to: string;
  onDone: (message: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [servings, setServings] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ["meal-plan", from, to],
    queryFn: () =>
      apiFetch<{ items: MealPlanEntry[] }>(
        `/api/meal-plan?from=${from}&to=${to}`,
      ),
  });

  const copy = useMutation({
    mutationFn: () =>
      apiFetch<{ created: number }>("/api/diary/from-meal-plan", {
        method: "POST",
        json: {
          entryIds: picked,
          servings: Object.fromEntries(
            Object.entries(servings)
              .filter(([id, value]) => picked.includes(id) && value.trim())
              .map(([id, value]) => [id, Number(value.replace(",", "."))]),
          ),
        },
      }),
    onSuccess: (result) =>
      onDone(`Přeneseno ${result.created} záznamů do deníku.`),
  });

  const items = data?.items ?? [];

  return (
    <div className="mb-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-1 text-lg font-semibold">Přenést z jídelníčku</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Jídelníček je plán, deník je realita — proto se nic nepřenáší samo.
        Vyber, co jsi opravdu snědl(a), a uprav si porce.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          V tomto týdnu nemáš v jídelníčku nic naplánovaného.
        </p>
      ) : (
        <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto">
          {items.map((entry) => {
            const isPicked = picked.includes(entry.id);
            return (
              <li
                key={entry.id}
                className="flex items-center gap-2 border-b border-border/60 py-1 text-sm"
              >
                <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isPicked}
                    onChange={() =>
                      setPicked((prev) =>
                        isPicked
                          ? prev.filter((id) => id !== entry.id)
                          : [...prev, entry.id],
                      )
                    }
                    className="h-5 w-5"
                  />
                </label>
                <span className="grow">
                  {entry.recipeTitle ?? entry.freeText}
                  <span className="block text-xs text-muted-foreground">
                    {new Date(`${entry.date}T00:00:00`).toLocaleDateString(
                      "cs-CZ",
                      { weekday: "short", day: "numeric", month: "numeric" },
                    )}{" "}
                    · {entry.mealTypeName}
                  </span>
                </span>
                {isPicked && (
                  <input
                    value={servings[entry.id] ?? String(entry.servings ?? 1)}
                    onChange={(e) =>
                      setServings((prev) => ({
                        ...prev,
                        [entry.id]: e.target.value,
                      }))
                    }
                    inputMode="decimal"
                    className="w-16 shrink-0 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                    aria-label="Počet porcí"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        onClick={() => copy.mutate()}
        disabled={picked.length === 0 || copy.isPending}
        className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
      >
        Přenést vybrané ({picked.length})
      </button>
    </div>
  );
}
