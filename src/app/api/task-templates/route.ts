import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { taskTemplates } from "@/db/schema";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { taskTemplateUpsertSchema } from "@/lib/schemas/tasks";
import { listTemplates } from "@/lib/tasks/service";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await listTemplates(ctx.householdId);
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = taskTemplateUpsertSchema.parse(await req.json());
  await db
    .insert(taskTemplates)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      name: input.name,
      description: input.description ?? null,
      taskListId: input.taskListId ?? null,
      templateGroupId: input.templateGroupId ?? null,
      intervalDays: input.intervalDays ?? null,
      sortOrder: input.sortOrder,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoUpdate({
      target: taskTemplates.id,
      set: {
        name: input.name,
        description: input.description ?? null,
        taskListId: input.taskListId ?? null,
        templateGroupId: input.templateGroupId ?? null,
        intervalDays: input.intervalDays ?? null,
        sortOrder: input.sortOrder,
        deletedAt: null,
        lastModifiedBy: ctx.user.id,
      },
    });
  return NextResponse.json({ id: input.id }, { status: 201 });
});
