import { z } from "zod";

const uuid = z.string().uuid();

export const rohlikMatchSchema = z.object({ listId: uuid });

export const rohlikCredentialsSchema = z.object({
  login: z.string().trim().email("Zadej e-mail, kterým se hlásíš k Rohlíku."),
  password: z.string().min(1, "Heslo nesmí být prázdné.").max(200),
});

export const rohlikSearchSchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export const rohlikCartSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        // Rohlík caps the per-product basket amount itself; this is just a
        // sanity bound so a typo cannot order fifty kilos of flour.
        quantity: z.number().int().positive().max(50),
        /** Remembers the pairing for next time when present. */
        foodId: uuid.nullish(),
        productName: z.string().trim().max(200).nullish(),
      }),
    )
    .min(1)
    .max(100),
});
