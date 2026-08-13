import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Očekáváno YYYY-MM-DD");

export const mealTypeUpsertSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(50),
  sortOrder: z.number().int().default(0),
});

export const mealPlanEntrySchema = z
  .object({
    id: uuid,
    date: isoDate,
    mealTypeId: uuid,
    sortOrder: z.number().int().default(0),
    recipeId: uuid.nullish(),
    freeText: z.string().trim().min(1).max(300).nullish(),
    servings: z.number().positive().max(200).nullish(),
    preparedBy: uuid.nullish(),
  })
  .refine((entry) => entry.recipeId || entry.freeText, {
    message: "Položka musí mít recept nebo text.",
  });

export const mealPlanEntryPatchSchema = z.object({
  date: isoDate.optional(),
  mealTypeId: uuid.optional(),
  sortOrder: z.number().int().optional(),
  recipeId: uuid.nullish(),
  freeText: z.string().trim().max(300).nullish(),
  servings: z.number().positive().max(200).nullish(),
  preparedBy: uuid.nullish(),
});

export const calendarEventSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullish(),
  allDay: z.boolean().default(false),
  rrule: z.string().trim().max(200).nullish(),
});

export const calendarEventPatchSchema = calendarEventSchema
  .partial()
  .omit({ id: true });

export const eventOverrideSchema = z.object({
  isCancelled: z.boolean().default(false),
  override: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      startsAt: z.string().datetime({ offset: true }).optional(),
      endsAt: z.string().datetime({ offset: true }).optional(),
    })
    .nullish(),
});

export const rangeQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});
