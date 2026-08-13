import { z } from "zod";

const nutrient = z.number().nonnegative().max(100000).nullish();

export const foodUnitSchema = z.object({
  id: z.string().uuid().optional(),
  unit: z.string().trim().min(1).max(30),
  gramsPerUnit: z.number().positive().max(10000),
});

export const foodUpsertSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  foodCategoryId: z.string().uuid().nullish(),
  referenceUnit: z.enum(["100g", "100ml", "piece"]).default("100g"),
  energyKj: nutrient,
  proteinG: nutrient,
  carbsG: nutrient,
  sugarsG: nutrient,
  fiberG: nutrient,
  fatG: nutrient,
  satFatG: nutrient,
  saltG: nutrient,
  densityGPerMl: z.number().positive().max(10).nullish(),
  gramsPerPiece: z.number().positive().max(100000).nullish(),
  divisiblePieces: z.boolean().default(false),
  source: z.enum(["seed", "manual", "openfoodfacts"]).default("manual"),
  offBarcode: z.string().trim().max(20).nullish(),
  units: z.array(foodUnitSchema).default([]),
});
export type FoodUpsert = z.infer<typeof foodUpsertSchema>;

export const foodPatchSchema = foodUpsertSchema.partial().omit({ id: true });
