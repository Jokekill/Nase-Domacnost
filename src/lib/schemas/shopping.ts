import { z } from "zod";
import { UNITS } from "@/db/schema";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const shoppingListCreateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(100),
  periodStart: isoDate,
  periodEnd: isoDate,
});

export const shoppingItemCreateSchema = z
  .object({
    id: uuid,
    foodId: uuid.nullish(),
    freeText: z.string().trim().min(1).max(200).nullish(),
    amount: z.number().positive().max(100000).nullish(),
    unit: z.enum(UNITS).nullish(),
    note: z.string().trim().max(200).nullish(),
    storeSectionId: uuid.nullish(),
  })
  .refine((item) => item.foodId || item.freeText, {
    message: "Položka musí mít potravinu nebo text.",
  });

export const shoppingItemPatchSchema = z.object({
  amount: z.number().positive().max(100000).nullish(),
  unit: z.enum(UNITS).nullish(),
  note: z.string().trim().max(200).nullish(),
  storeSectionId: uuid.nullish(),
  sortOrder: z.number().int().optional(),
});

export const importIntoListSchema = z.union([
  z.object({
    recipeId: uuid,
    servings: z.number().positive().max(200).optional(),
  }),
  z.object({ mealPlanFrom: isoDate, mealPlanTo: isoDate }),
]);
