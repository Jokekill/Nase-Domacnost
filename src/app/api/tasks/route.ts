import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { createTasks, listTasks } from "@/lib/tasks/service";
import { createTasksSchema, taskQuerySchema } from "@/lib/schemas/tasks";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const sp = req.nextUrl.searchParams;
  const filters = taskQuerySchema.parse({
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    listId: sp.get("listId") ?? undefined,
    status: sp.get("status") ?? undefined,
  });
  const items = await listTasks(ctx.householdId, filters);
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = createTasksSchema.parse(await req.json());
  const result = await createTasks(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input,
  );
  return NextResponse.json(result, { status: 201 });
});
