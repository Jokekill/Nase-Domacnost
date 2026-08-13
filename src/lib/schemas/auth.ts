import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(8).max(200);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(100),
  inviteToken: z.string().optional(),
  householdName: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  preferences: z
    .object({ theme: z.enum(["light", "dark", "system"]).optional() })
    .passthrough()
    .optional(),
  currentPassword: z.string().optional(),
  newPassword: passwordSchema.optional(),
});

export const resetRequestSchema = z.object({ email: emailSchema });
export const resetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export const createInviteSchema = z.object({
  role: z.enum(["admin", "member"]).default("member"),
});

export const updateHouseholdSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
