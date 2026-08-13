import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { households, users } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold, requireUser } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { updateMeSchema } from "@/lib/schemas/auth";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const [household] = await db
    .select({ id: households.id, name: households.name })
    .from(households)
    .where(eq(households.id, ctx.householdId))
    .limit(1);
  return NextResponse.json({
    id: ctx.user.id,
    email: ctx.user.email,
    displayName: ctx.user.displayName,
    preferences: ctx.user.preferences,
    role: ctx.role,
    household,
  });
});

export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const input = updateMeSchema.parse(await req.json());

  const updates: Partial<typeof users.$inferInsert> = {};
  if (input.displayName !== undefined) updates.displayName = input.displayName;
  if (input.preferences !== undefined) {
    updates.preferences = sql`${users.preferences} || ${JSON.stringify(
      input.preferences,
    )}::jsonb` as never;
  }
  if (input.newPassword) {
    if (
      !input.currentPassword ||
      !(await verifyPassword(user.passwordHash, input.currentPassword))
    ) {
      throw new ApiError("forbidden", "Současné heslo nesouhlasí.");
    }
    updates.passwordHash = await hashPassword(input.newPassword);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }
  updates.lastModifiedBy = user.id;
  await db.update(users).set(updates).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
});
