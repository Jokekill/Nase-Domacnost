import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { tags } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { tagUpsertSchema } from "@/lib/schemas/recipes";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.householdId, ctx.householdId), isNull(tags.deletedAt)))
    .orderBy(asc(tags.name));
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = tagUpsertSchema.parse(await req.json());
  await db
    .insert(tags)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      name: input.name,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoNothing();
  return NextResponse.json({ id: input.id }, { status: 201 });
});
