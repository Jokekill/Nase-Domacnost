/**
 * Occasional-task suggestions with load spreading (zadání §10.5).
 *
 * The problem: if six templates come due in the same week, dumping all six
 * into one cleanup makes the week unbearable and the list gets ignored.
 *
 * The rule:
 *  1. A template is due when `lastCompletedAt + intervalDays <= today`.
 *     A template that was never done is due immediately.
 *  2. Urgency is measured RELATIVELY: `daysOverdue / intervalDays`. Being a
 *     week late on a weekly job matters far more than a week on a yearly one.
 *  3. Templates that already have an open task are skipped — nothing is
 *     suggested twice.
 *  4. At most `maxPerPeriod` suggestions are returned; the rest wait for the
 *     following period. That is the actual load spreading.
 *  5. Ties break towards the longer interval, so rare big jobs (clean the
 *     oven) do not starve behind frequent small ones.
 */

export type SuggestionTemplate = {
  templateId: string;
  name: string;
  intervalDays: number | null;
  /** Last time this template was completed; null = never. */
  lastCompletedAt: Date | null;
  /** When the template itself was created — the clock starts here. */
  createdAt: Date;
  /** True when an unfinished task from this template already exists. */
  hasOpenTask: boolean;
};

export type TaskSuggestion = {
  templateId: string;
  name: string;
  intervalDays: number;
  lastCompletedAt: Date | null;
  daysSince: number;
  daysOverdue: number;
  /** daysOverdue / intervalDays — used for ordering. */
  urgency: number;
};

export const DEFAULT_MAX_SUGGESTIONS = 3;

const DAY_MS = 86_400_000;

function wholeDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((b - a) / DAY_MS);
}

export function suggestOccasionalTasks(
  templates: SuggestionTemplate[],
  today: Date,
  maxPerPeriod: number = DEFAULT_MAX_SUGGESTIONS,
): TaskSuggestion[] {
  const due: TaskSuggestion[] = [];

  for (const template of templates) {
    if (template.intervalDays == null || template.intervalDays <= 0) continue;
    if (template.hasOpenTask) continue;

    const since = template.lastCompletedAt ?? template.createdAt;
    const daysSince = wholeDaysBetween(since, today);
    const daysOverdue = daysSince - template.intervalDays;
    if (daysOverdue < 0) continue;

    due.push({
      templateId: template.templateId,
      name: template.name,
      intervalDays: template.intervalDays,
      lastCompletedAt: template.lastCompletedAt,
      daysSince,
      daysOverdue,
      urgency: daysOverdue / template.intervalDays,
    });
  }

  due.sort((a, b) => {
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    // Same relative lateness: do the rarer job first so it never starves.
    return b.intervalDays - a.intervalDays;
  });

  return maxPerPeriod > 0 ? due.slice(0, maxPerPeriod) : due;
}

/** "naposledy 1. 7., interval 2 měsíce" → text for the UI. */
export function describeSuggestion(suggestion: TaskSuggestion): string {
  const interval = formatInterval(suggestion.intervalDays);
  if (!suggestion.lastCompletedAt) {
    return `zatím nikdy · interval ${interval}`;
  }
  const last = suggestion.lastCompletedAt.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  return `naposledy ${last} · interval ${interval}`;
}

export function formatInterval(days: number): string {
  if (days === 1) return "denně";
  if (days === 7) return "týdně";
  if (days === 14) return "2 týdny";
  if (days === 30 || days === 31) return "měsíčně";
  if (days === 180) return "půl roku";
  if (days === 365) return "ročně";
  if (days % 30 === 0) {
    const months = days / 30;
    // Czech plural: 2–4 "měsíce", 5+ "měsíců"
    return `${months} ${months < 5 ? "měsíce" : "měsíců"}`;
  }
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} ${weeks < 5 ? "týdny" : "týdnů"}`;
  }
  return `${days} dní`;
}

export const INTERVAL_PRESETS: { label: string; days: number | null }[] = [
  { label: "Neopakuje se", days: null },
  { label: "Denně", days: 1 },
  { label: "Týdně", days: 7 },
  { label: "Každé 2 týdny", days: 14 },
  { label: "Měsíčně", days: 30 },
  { label: "Každé 3 měsíce", days: 90 },
  { label: "Každého půl roku", days: 180 },
  { label: "Ročně", days: 365 },
];
