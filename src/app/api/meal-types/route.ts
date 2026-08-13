import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { mealTypes } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { mealTypeUpsertSchema } from "@/lib/schemas/planning";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await db
    .select({
      id: mealTypes.id,
      name: mealTypes.name,
      sortOrder: mealTypes.sortOrder,
    })
    .from(mealTypes)
    .where(
      and(eq(mealTypes.householdId, ctx.householdId), isNull(mealTypes.deletedAt)),
    )
    .orderBy(asc(mealTypes.sortOrder), asc(mealTypes.name));
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = mealTypeUpsertSchema.parse(await req.json());
  await db
    .insert(mealTypes)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      name: input.name,
      sortOrder: input.sortOrder,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoUpdate({
      target: mealTypes.id,
      set: {
        name: input.name,
        sortOrder: input.sortOrder,
        deletedAt: null,
        lastModifiedBy: ctx.user.id,
      },
    });
  return NextResponse.json({ id: input.id }, { status: 201 });
});
