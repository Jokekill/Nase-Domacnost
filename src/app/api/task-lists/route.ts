import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { taskLists } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { taskListUpsertSchema } from "@/lib/schemas/tasks";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await db
    .select({
      id: taskLists.id,
      name: taskLists.name,
      sortOrder: taskLists.sortOrder,
    })
    .from(taskLists)
    .where(
      and(eq(taskLists.householdId, ctx.householdId), isNull(taskLists.deletedAt)),
    )
    .orderBy(asc(taskLists.sortOrder), asc(taskLists.name));
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = taskListUpsertSchema.parse(await req.json());
  await db
    .insert(taskLists)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      name: input.name,
      sortOrder: input.sortOrder,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoUpdate({
      target: taskLists.id,
      set: {
        name: input.name,
        sortOrder: input.sortOrder,
        deletedAt: null,
        lastModifiedBy: ctx.user.id,
      },
    });
  return NextResponse.json({ id: input.id }, { status: 201 });
});
