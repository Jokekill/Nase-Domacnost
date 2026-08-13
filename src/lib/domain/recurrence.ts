/**
 * Minimal RFC 5545 recurrence support (docs/DATA-MODEL.md §5).
 * Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY, UNTIL, COUNT.
 * Occurrences are computed on read — nothing is materialised in the DB.
 */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type Rrule = {
  freq: Frequency;
  interval: number;
  /** Weekday codes MO..SU; only meaningful for WEEKLY. */
  byDay?: string[];
  until?: Date;
  count?: number;
};

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function parseRrule(value: string | null | undefined): Rrule | null {
  if (!value?.trim()) return null;
  const parts = value.replace(/^RRULE:/i, "").split(";");
  const map = new Map<string, string>();
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key && val) map.set(key.trim().toUpperCase(), val.trim());
  }
  const freq = map.get("FREQ")?.toUpperCase();
  if (
    freq !== "DAILY" &&
    freq !== "WEEKLY" &&
    freq !== "MONTHLY" &&
    freq !== "YEARLY"
  ) {
    return null;
  }
  const interval = Number(map.get("INTERVAL") ?? 1);
  const byDay = map
    .get("BYDAY")
    ?.split(",")
    .map((d) => d.trim().toUpperCase())
    .filter((d) => (WEEKDAYS as readonly string[]).includes(d));
  const untilRaw = map.get("UNTIL");
  const count = map.get("COUNT") ? Number(map.get("COUNT")) : undefined;

  return {
    freq,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1,
    byDay: byDay?.length ? byDay : undefined,
    until: untilRaw ? parseUntil(untilRaw) : undefined,
    count: count && Number.isFinite(count) && count > 0 ? count : undefined,
  };
}

function parseUntil(value: string): Date | undefined {
  // Accepts 20260813T235959Z, 20260813 and ISO strings.
  const compact = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(
    value,
  );
  if (compact) {
    return new Date(
      Date.UTC(
        Number(compact[1]),
        Number(compact[2]) - 1,
        Number(compact[3]),
        Number(compact[5] ?? 23),
        Number(compact[6] ?? 59),
        Number(compact[7] ?? 59),
      ),
    );
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function formatRrule(rule: Rrule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(",")}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until) {
    const iso = rule.until.toISOString().replace(/[-:]/g, "").split(".")[0];
    parts.push(`UNTIL=${iso}Z`);
  }
  return parts.join(";");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const targetDay = date.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  // Clamp to the last day of the target month (31 Jan + 1 month → 28/29 Feb).
  const daysInMonth = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(targetDay, daysInMonth));
  return next;
}

/** Guard against runaway loops on pathological rules. */
const MAX_ITERATIONS = 2000;

/**
 * Expands occurrences of an event into [rangeStart, rangeEnd] (inclusive).
 * `start` keeps its time-of-day in every occurrence.
 */
export function expandOccurrences(
  start: Date,
  rrule: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const rule = parseRrule(rrule);
  if (!rule) {
    return start >= rangeStart && start <= rangeEnd ? [start] : [];
  }

  const out: Date[] = [];
  let emitted = 0;
  let cursor = new Date(start);
  let iterations = 0;

  const withTime = (date: Date) => {
    const next = new Date(date);
    next.setHours(
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
      start.getMilliseconds(),
    );
    return next;
  };

  const emit = (date: Date): boolean => {
    if (rule.until && date > rule.until) return false;
    if (rule.count && emitted >= rule.count) return false;
    emitted++;
    if (date >= rangeStart && date <= rangeEnd) out.push(date);
    return true;
  };

  if (rule.freq === "WEEKLY" && rule.byDay?.length) {
    // Walk week by week and emit the selected weekdays in order.
    const startOfWeek = addDays(start, -start.getDay());
    let weekStart = new Date(startOfWeek);
    while (iterations++ < MAX_ITERATIONS) {
      for (const code of [...rule.byDay].sort(
        (a, b) => WEEKDAYS.indexOf(a as never) - WEEKDAYS.indexOf(b as never),
      )) {
        const occurrence = withTime(
          addDays(weekStart, WEEKDAYS.indexOf(code as never)),
        );
        if (occurrence < start) continue;
        if (!emit(occurrence)) return out;
      }
      weekStart = addDays(weekStart, 7 * rule.interval);
      if (weekStart > rangeEnd) break;
    }
    return out;
  }

  // Each occurrence is derived from the ORIGINAL start, never from the
  // previously clamped one — otherwise 31 Jan → 28 Feb would then yield
  // 28 Mar instead of 31 Mar.
  let step = 0;
  while (iterations++ < MAX_ITERATIONS) {
    switch (rule.freq) {
      case "DAILY":
        cursor = addDays(start, step * rule.interval);
        break;
      case "WEEKLY":
        cursor = addDays(start, step * 7 * rule.interval);
        break;
      case "MONTHLY":
        cursor = addMonths(start, step * rule.interval);
        break;
      case "YEARLY":
        cursor = addMonths(start, step * 12 * rule.interval);
        break;
    }
    if (cursor > rangeEnd) break;
    if (!emit(new Date(cursor))) break;
    step++;
  }
  return out;
}

/** Local YYYY-MM-DD key used for calendar grouping. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const RRULE_PRESETS: { label: string; value: string | null }[] = [
  { label: "Neopakuje se", value: null },
  { label: "Každý den", value: "FREQ=DAILY" },
  { label: "Každý týden", value: "FREQ=WEEKLY" },
  { label: "Každé 2 týdny", value: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Každý měsíc", value: "FREQ=MONTHLY" },
  { label: "Každý rok", value: "FREQ=YEARLY" },
];
