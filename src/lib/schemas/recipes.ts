import { z } from "zod";
import { DIFFICULTIES, UNITS, VISIBILITIES } from "@/db/schema";

const uuid = z.string().uuid();

export const nutritionOverrideSchema = z
  .object({
    energyKj: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    sugarsG: z.number().nonnegative().optional(),
    fiberG: z.number().nonnegative().optional(),
    fatG: z.number().nonnegative().optional(),
    satFatG: z.number().nonnegative().optional(),
    saltG: z.number().nonnegative().optional(),
  })
  .strict();

export const ingredientSchema = z
  .object({
    id: uuid,
    groupId: uuid.nullish(),
    foodId: uuid.nullish(),
    freeText: z.string().trim().min(1).max(300).nullish(),
    amount: z.number().positive().nullish(),
    unit: z.enum(UNITS).nullish(),
    note: z.string().trim().max(300).nullish(),
    isOptional: z.boolean().default(false),
    sortOrder: z.number().int(),
    nutritionOverride: nutritionOverrideSchema.nullish(),
  })
  .refine((i) => i.foodId || i.freeText, {
    message: "Ingredience musí mít potravinu nebo volný text.",
  });

export const ingredientGroupSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(100),
  sortOrder: z.number().int(),
});

export const stepSchema = z.object({
  id: uuid,
  text: z.string().trim().min(1).max(4000),
  sortOrder: z.number().int(),
  photoId: uuid.nullish(),
  ingredientIds: z.array(uuid).default([]),
});

export const prepAheadSchema = z.object({
  id: uuid,
  leadTimeHours: z.number().int().positive().max(24 * 30),
  description: z.string().trim().min(1).max(300),
});

export const recipeUpsertSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(200),
  intro: z.string().trim().max(2000).nullish(),
  baseServings: z.number().int().positive().max(100),
  prepTimeMin: z.number().int().nonnegative().max(10000).nullish(),
  cookTimeMin: z.number().int().nonnegative().max(10000).nullish(),
  difficulty: z.enum(DIFFICULTIES).nullish(),
  source: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  visibility: z.enum(VISIBILITIES).default("household"),
  groups: z.array(ingredientGroupSchema).default([]),
  ingredients: z.array(ingredientSchema).default([]),
  steps: z.array(stepSchema).default([]),
  categoryIds: z.array(uuid).default([]),
  tagIds: z.array(uuid).default([]),
  prepAhead: prepAheadSchema.nullish(),
});
export type RecipeUpsert = z.infer<typeof recipeUpsertSchema>;

export const recipeListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: uuid.optional(),
  /** Only recipes filed in no chapter at all (§5.1). */
  uncategorised: z.coerce.boolean().optional(),
  tagIds: z.array(uuid).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  maxTotalTime: z.coerce.number().int().positive().optional(),
  includeFoodId: uuid.optional(),
  excludeFoodId: uuid.optional(),
  includeFoodCategoryId: uuid.optional(),
  excludeFoodCategoryId: uuid.optional(),
  sort: z.enum(["newest", "title", "time"]).default("newest"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(60).default(24),
});
export type RecipeListQuery = z.infer<typeof recipeListQuerySchema>;

export const categoryUpsertSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(100),
  parentId: uuid.nullish(),
  sortOrder: z.number().int().default(0),
});

export const tagUpsertSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(50),
});
