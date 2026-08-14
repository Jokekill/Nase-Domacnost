import { z } from "zod";
import { SHARE_PERMISSIONS } from "@/db/schema";

const uuid = z.string().uuid();

export const shareCreateSchema = z
  .object({
    id: uuid.optional(),
    /** Either an existing user id, or the e-mail they registered with. */
    userId: uuid.optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    permission: z.enum(SHARE_PERMISSIONS).default("view"),
  })
  .refine((v) => v.userId || v.email, {
    message: "Zadej uživatele nebo e-mail.",
  });
export type ShareCreate = z.infer<typeof shareCreateSchema>;

export const publicLinkCreateSchema = z.object({
  id: uuid.optional(),
  /** Days until the link stops working; omitted = no expiry. */
  expiresInDays: z.number().int().positive().max(365).nullish(),
});
export type PublicLinkCreate = z.infer<typeof publicLinkCreateSchema>;

export const recipeCopySchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  /** Copy photo files too (default yes, docs/ARCHITECTURE.md §2.2). */
  withPhotos: z.boolean().default(true),
});
export type RecipeCopy = z.infer<typeof recipeCopySchema>;
