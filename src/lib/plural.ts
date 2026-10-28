/**
 * Czech counting: 1 recept, 2–4 recepty, 5+ receptů.
 *
 * Only the three forms the UI needs; Czech has more, but nothing here counts
 * in cases other than the nominative.
 */
export function plural(
  count: number,
  forms: [one: string, few: string, many: string],
): string {
  const n = Math.abs(count);
  if (n === 1) return forms[0];
  if (n >= 2 && n <= 4) return forms[1];
  return forms[2];
}

export const RECIPES: [string, string, string] = [
  "recept",
  "recepty",
  "receptů",
];

/** "7 receptů" */
export function recipeCount(count: number): string {
  return `${count} ${plural(count, RECIPES)}`;
}
