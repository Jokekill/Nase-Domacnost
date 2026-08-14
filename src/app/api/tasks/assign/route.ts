import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { assignSchema } from "@/lib/schemas/tasks";
import { assignTasks } from "@/lib/tasks/service";

/** Bulk assignment: one person, many tasks, one confirm (§10.5). */
export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = assignSchema.parse(await req.json());
  await assignTasks(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input.taskIds,
    input.userId,
    input.mode,
  );
  return NextResponse.json({ ok: true });
});
