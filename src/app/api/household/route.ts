import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { households } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireAdmin, requireHousehold } from "@/lib/auth/guards";
import { updateHouseholdSchema } from "@/lib/schemas/auth";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const [household] = await db
    .select({
      id: households.id,
      name: households.name,
      createdAt: households.createdAt,
    })
    .from(households)
    .where(eq(households.id, ctx.householdId))
    .limit(1);
  return NextResponse.json({ ...household, role: ctx.role });
});

export const PATCH = apiHandler(async (req: NextRequest) => {
  const ctx = await requireAdmin();
  const input = updateHouseholdSchema.parse(await req.json());
  await db
    .update(households)
    .set({ name: input.name, lastModifiedBy: ctx.user.id })
    .where(eq(households.id, ctx.householdId));
  return NextResponse.json({ ok: true });
});
