/** Local-date helpers. Everything user-facing is Czech and Monday-first. */

export const WEEKDAY_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
export const MONTH_NAMES = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7; // Monday = 0
  const start = addDays(date, -day);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function formatDayLabel(date: Date): string {
  return `${WEEKDAY_SHORT[(date.getDay() + 6) % 7]} ${date.getDate()}. ${date.getMonth() + 1}.`;
}

export function formatRange(from: Date, to: Date): string {
  const sameMonth = from.getMonth() === to.getMonth();
  return sameMonth
    ? `${from.getDate()}.–${to.getDate()}. ${to.getMonth() + 1}. ${to.getFullYear()}`
    : `${from.getDate()}. ${from.getMonth() + 1}. – ${to.getDate()}. ${to.getMonth() + 1}. ${to.getFullYear()}`;
}

export function isToday(date: Date): boolean {
  return toDateKey(date) === toDateKey(new Date());
}
