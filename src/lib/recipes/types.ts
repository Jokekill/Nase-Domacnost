import type { UNITS, DIFFICULTIES } from "@/db/schema";

export type Unit = (typeof UNITS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  ks: "ks",
  lzicka: "lžička",
  lzice: "lžíce",
  spetka: "špetka",
  dle_chuti: "dle chuti",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "snadné",
  medium: "střední",
  hard: "náročné",
};

export type RecipeListItem = {
  id: string;
  title: string;
  baseServings: number;
  totalTimeMin: number | null;
  difficulty: Difficulty | null;
  mainPhotoKey: string | null;
};

export type RecipeListResponse = {
  items: RecipeListItem[];
  nextCursor: string | null;
};

export function formatTime(totalMin: number | null): string | null {
  if (!totalMin) return null;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h}:${String(m).padStart(2, "0")} h`;
}
