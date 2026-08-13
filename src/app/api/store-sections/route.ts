import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { storeSections } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await db
    .select({
      id: storeSections.id,
      name: storeSections.name,
      sortOrder: storeSections.sortOrder,
    })
    .from(storeSections)
    .where(
      and(
        eq(storeSections.householdId, ctx.householdId),
        isNull(storeSections.deletedAt),
      ),
    )
    .orderBy(asc(storeSections.sortOrder));
  return NextResponse.json({ items });
});
