import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { templateGroups } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { templateGroupUpsertSchema } from "@/lib/schemas/tasks";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await db
    .select({
      id: templateGroups.id,
      name: templateGroups.name,
      taskListId: templateGroups.taskListId,
      sortOrder: templateGroups.sortOrder,
    })
    .from(templateGroups)
    .where(
      and(
        eq(templateGroups.householdId, ctx.householdId),
        isNull(templateGroups.deletedAt),
      ),
    )
    .orderBy(asc(templateGroups.sortOrder), asc(templateGroups.name));
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = templateGroupUpsertSchema.parse(await req.json());
  await db
    .insert(templateGroups)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      name: input.name,
      taskListId: input.taskListId ?? null,
      sortOrder: input.sortOrder,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoUpdate({
      target: templateGroups.id,
      set: {
        name: input.name,
        taskListId: input.taskListId ?? null,
        sortOrder: input.sortOrder,
        deletedAt: null,
        lastModifiedBy: ctx.user.id,
      },
    });
  return NextResponse.json({ id: input.id }, { status: 201 });
});
