"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { apiFetch } from "@/lib/api/client";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  addDays,
  endOfMonth,
  formatRange,
  isToday,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from "@/lib/dates";
import { RRULE_PRESETS } from "@/lib/domain/recurrence";

type CalendarItem =
  | {
      kind: "meal";
      id: string;
      date: string;
      title: string;
      detail: string | null;
      recipeId: string | null;
    }
  | {
      kind: "event";
      id: string;
      date: string;
      title: string;
      detail: string | null;
      startsAt: string;
      allDay: boolean;
      isRecurring: boolean;
    }
  | {
      kind: "task";
      id: string;
      periodStart: string | null;
      periodEnd: string | null;
      date: string | null;
      title: string;
      done: boolean;
    }
  | {
      kind: "shopping";
      id: string;
      periodStart: string;
      periodEnd: string;
      title: string;
    };

const KIND_STYLE: Record<CalendarItem["kind"], string> = {
  meal: "bg-surface-warm text-foreground",
  event: "bg-primary/15 text-primary",
  task: "bg-accent-green/20 text-foreground",
  shopping: "bg-warning/20 text-foreground",
};
const KIND_ICON: Record<CalendarItem["kind"], string> = {
  meal: "🍽",
  event: "📅",
  task: "✅",
  shopping: "🛒",
};

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [showEventForm, setShowEventForm] = useState(false);

  const rangeStart =
    view === "month" ? startOfWeek(startOfMonth(anchor)) : startOfWeek(anchor);
  const rangeEnd =
    view === "month"
      ? addDays(startOfWeek(endOfMonth(anchor)), 6)
      : addDays(rangeStart, 6);
  const from = toDateKey(rangeStart);
  const to = toDateKey(rangeEnd);

  const { data } = useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () =>
      apiFetch<{ items: CalendarItem[] }>(`/api/calendar?from=${from}&to=${to}`),
  });

  const items = data?.items ?? [];
  const dayCount =
    Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
  const days = Array.from({ length: dayCount }, (_, i) =>
    addDays(rangeStart, i),
  );

  /** Items pinned to a single day. */
  const itemsForDay = (key: string) =>
    items.filter(
      (item) =>
        (item.kind === "meal" && item.date === key) ||
        (item.kind === "event" && item.date === key) ||
        (item.kind === "task" &&
          item.date === key &&
          item.periodStart === item.periodEnd),
    );

  /** Items spanning a period — drawn as a bar above the grid (zadání §10.3). */
  type Span = {
    key: string;
    kind: "shopping" | "task";
    title: string;
    start: string;
    end: string;
  };
  const spans: Span[] = items.flatMap<Span>((item) => {
    if (item.kind === "shopping") {
      return [
        {
          key: `shopping-${item.id}`,
          kind: "shopping" as const,
          title: item.title,
          start: item.periodStart,
          end: item.periodEnd,
        },
      ];
    }
    if (
      item.kind === "task" &&
      item.periodStart &&
      item.periodEnd &&
      item.periodStart !== item.periodEnd
    ) {
      return [
        {
          key: `task-${item.id}`,
          kind: "task" as const,
          title: item.title,
          start: item.periodStart,
          end: item.periodEnd,
        },
      ];
    }
    return [];
  });

  const shift = (direction: number) => {
    if (view === "month") {
      const next = new Date(anchor);
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
      setAnchor(next);
    } else {
      setAnchor(addDays(anchor, 7 * direction));
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">Kalendář</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border p-0.5 text-sm">
            <button
              onClick={() => setView("month")}
              className={`rounded px-3 py-1.5 ${view === "month" ? "bg-surface-warm text-primary" : "text-muted-foreground"}`}
            >
              Měsíc
            </button>
            <button
              onClick={() => setView("week")}
              className={`rounded px-3 py-1.5 ${view === "week" ? "bg-surface-warm text-primary" : "text-muted-foreground"}`}
            >
              Týden
            </button>
          </div>
          <button
            onClick={() => shift(-1)}
            className="rounded-lg border border-border px-3 py-2 min-h-11"
            aria-label="Zpět"
          >
            ←
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border border-border px-3 py-2 text-sm min-h-11"
          >
            Dnes
          </button>
          <button
            onClick={() => shift(1)}
            className="rounded-lg border border-border px-3 py-2 min-h-11"
            aria-label="Vpřed"
          >
            →
          </button>
          <button
            onClick={() => setShowEventForm(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
          >
            + Událost
          </button>
        </div>
      </div>

      <p className="mb-3 text-muted-foreground">
        {view === "month"
          ? `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
          : formatRange(rangeStart, rangeEnd)}
      </p>

      {spans.length > 0 && (
        <div className="mb-3 space-y-1">
          {spans.map((span) => (
            <div
              key={span.key}
              className={`rounded-lg px-3 py-1.5 text-sm ${KIND_STYLE[span.kind]}`}
            >
              {KIND_ICON[span.kind]} <strong>{span.title}</strong>{" "}
              <span className="text-muted-foreground">
                {new Date(`${span.start}T00:00:00`).getDate()}.–
                {new Date(`${span.end}T00:00:00`).getDate()}.{" "}
                {new Date(`${span.end}T00:00:00`).getMonth() + 1}.
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card border border-border bg-border">
        {WEEKDAY_SHORT.map((day) => (
          <div
            key={day}
            className="bg-surface px-1 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {days.map((day) => {
          const key = toDateKey(day);
          const dayItems = itemsForDay(key);
          const outsideMonth =
            view === "month" && day.getMonth() !== anchor.getMonth();
          return (
            <div
              key={key}
              className={`min-h-24 bg-surface p-1 ${outsideMonth ? "opacity-40" : ""} ${
                view === "week" ? "min-h-48" : ""
              }`}
            >
              <div
                className={`mb-1 text-right text-xs ${
                  isToday(day)
                    ? "font-semibold text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {day.getDate()}
              </div>
              <ul className="space-y-0.5">
                {dayItems.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    {item.kind === "meal" && item.recipeId ? (
                      <Link
                        href={`/kucharka/${item.recipeId}`}
                        className={`block truncate rounded px-1 py-0.5 text-xs ${KIND_STYLE[item.kind]}`}
                        title={`${item.detail ?? ""}: ${item.title}`}
                      >
                        {KIND_ICON[item.kind]} {item.title}
                      </Link>
                    ) : (
                      <span
                        className={`block truncate rounded px-1 py-0.5 text-xs ${KIND_STYLE[item.kind]}`}
                        title={item.title}
                      >
                        {KIND_ICON[item.kind]} {item.title}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        🍽 jídelníček · 📅 událost · ✅ úkol · 🛒 nákup. Úkoly a nákupy
        s obdobím se zobrazují jako pruh nad kalendářem.
      </p>

      {showEventForm && (
        <EventForm
          onClose={() => setShowEventForm(false)}
          onSaved={async () => {
            setShowEventForm(false);
            await queryClient.invalidateQueries({ queryKey: ["calendar"] });
          }}
        />
      )}
    </div>
  );
}

function EventForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toDateKey(new Date()));
  const [time, setTime] = useState("18:00");
  const [allDay, setAllDay] = useState(false);
  const [rrule, setRrule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const startsAt = new Date(`${date}T${allDay ? "00:00" : time}:00`);
      return apiFetch("/api/calendar/events", {
        method: "POST",
        json: {
          id: uuidv7(),
          title: title.trim(),
          startsAt: startsAt.toISOString(),
          allDay,
          rrule,
        },
      });
    },
    onSuccess: onSaved,
    onError: (err) => setError(err.message),
  });

  const input =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-card bg-surface p-4 shadow-pop sm:rounded-card">
        <h2 className="mb-3 text-lg font-semibold">Nová událost</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Název</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kroužek, návštěva, servis auta…"
              className={input}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1 block text-xs font-medium">Datum</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={input}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium">Čas</span>
              <input
                type="time"
                value={time}
                disabled={allDay}
                onChange={(e) => setTime(e.target.value)}
                className={`${input} disabled:opacity-50`}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            Celodenní
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Opakování</span>
            <select
              value={rrule ?? ""}
              onChange={(e) => setRrule(e.target.value || null)}
              className={input}
            >
              {RRULE_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.value ?? ""}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => save.mutate()}
            disabled={!title.trim() || save.isPending}
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
          >
            Uložit
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
