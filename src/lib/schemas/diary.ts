import { z } from "zod";
import { UNITS } from "@/db/schema";
import { NUTRIENT_KEYS } from "@/lib/domain/nutrition";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Očekáváno YYYY-MM-DD");
const nutrient = z.number().nonnegative().max(1000000).nullish();

const nutritionValuesSchema = z
  .object(
    Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, nutrient])) as Record<
      (typeof NUTRIENT_KEYS)[number],
      typeof nutrient
    >,
  )
  .partial();

const base = {
  id: uuid.optional(),
  date: isoDate,
  mealTypeId: uuid.nullish(),
  note: z.string().trim().max(300).nullish(),
};

export const diaryEntryCreateSchema = z.discriminatedUnion("sourceKind", [
  z.object({
    ...base,
    sourceKind: z.literal("recipe"),
    recipeId: uuid,
    servings: z.number().positive().max(100),
  }),
  z.object({
    ...base,
    sourceKind: z.literal("food"),
    foodId: uuid,
    amount: z.number().positive().max(100000),
    unit: z.enum(UNITS),
  }),
  z.object({
    ...base,
    sourceKind: z.literal("manual"),
    title: z.string().trim().min(1).max(200),
    amount: z.number().positive().max(100000).nullish(),
    unit: z.string().trim().max(20).nullish(),
    nutrition: nutritionValuesSchema.default({}),
  }),
]);

export const diaryEntryPatchSchema = z.object({
  mealTypeId: uuid.nullish(),
  note: z.string().trim().max(300).nullish(),
  date: isoDate.optional(),
});

export const fromMealPlanSchema = z.object({
  entryIds: z.array(uuid).min(1).max(100),
  servings: z.record(uuid, z.number().positive().max(100)).optional(),
});

export const goalSchema = z.object({
  nutrientKey: z.enum(NUTRIENT_KEYS),
  targetPerDay: z.number().positive().max(1000000).nullable(),
});

export const diaryRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
});
