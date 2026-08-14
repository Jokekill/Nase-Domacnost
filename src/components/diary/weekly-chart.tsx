"use client";

import { WEEKDAY_SHORT } from "@/lib/dates";
import {
  NUTRIENT_LABELS,
  formatNutrient,
  type NutrientKey,
} from "@/lib/domain/nutrition";

type DayTotals = {
  date: string;
  totals: Partial<Record<NutrientKey, number | null>>;
  incomplete: boolean;
};

/**
 * Plain inline SVG bar chart — no charting dependency, which keeps the bundle
 * small enough to stay pleasant on a phone and on the Pi.
 */
export function WeeklyChart({
  days,
  dates,
  nutrient,
  goal,
  unit,
}: {
  days: DayTotals[];
  /** The full week, so days without entries still get a slot. */
  dates: Date[];
  nutrient: NutrientKey;
  goal?: number | null;
  unit: string;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const values = dates.map((date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const day = byDate.get(key);
    return {
      date,
      value: (day?.totals[nutrient] ?? null) as number | null,
      incomplete: day?.incomplete ?? false,
    };
  });

  const numeric = values
    .map((v) => v.value)
    .filter((v): v is number => v != null);
  const max = Math.max(...numeric, goal ?? 0, 1);

  const height = 140;
  const barGap = 8;
  const barWidth = 100 / values.length;

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-36 w-full"
        role="img"
        aria-label={`Graf ${NUTRIENT_LABELS[nutrient]} po dnech: ${values
          .map(
            (v) =>
              `${WEEKDAY_SHORT[(v.date.getDay() + 6) % 7]} ${v.value == null ? "bez záznamu" : `${formatNutrient(nutrient, v.value)} ${unit}`}`,
          )
          .join(", ")}`}
      >
        {goal != null && goal > 0 && (
          <line
            x1="0"
            x2="100"
            y1={height - (goal / max) * (height - 20)}
            y2={height - (goal / max) * (height - 20)}
            stroke="var(--accent-green)"
            strokeWidth="1"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {values.map((entry, index) => {
          const barHeight =
            entry.value != null ? (entry.value / max) * (height - 20) : 0;
          return (
            <rect
              key={index}
              x={index * barWidth + barGap / 4}
              y={height - barHeight}
              width={barWidth - barGap / 2}
              height={barHeight}
              rx="1"
              fill={entry.incomplete ? "var(--warning)" : "var(--primary)"}
              opacity={entry.value != null ? 1 : 0.15}
            />
          );
        })}
      </svg>
      <div className="mt-1 grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {values.map((entry, index) => (
          <div key={index}>
            <div>{WEEKDAY_SHORT[(entry.date.getDay() + 6) % 7]}</div>
            <div className="font-medium text-foreground">
              {entry.value != null
                ? formatNutrient(nutrient, entry.value)
                : "—"}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Hodnoty v {unit}
        {goal != null && goal > 0 && " · zelená čára = tvůj denní cíl"}
        {values.some((v) => v.incomplete) &&
          " · oranžový sloupec = některé hodnoty chybí"}
      </p>
    </div>
  );
}
