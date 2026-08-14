import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { listGoals, setGoal } from "@/lib/diary/service";
import { goalSchema } from "@/lib/schemas/diary";

export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const items = await listGoals({
    userId: ctx.user.id,
    householdId: ctx.householdId,
  });
  return NextResponse.json({ items });
});

/** Sets or clears (targetPerDay = null) a personal daily target. */
export const PUT = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = goalSchema.parse(await req.json());
  await setGoal(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input.nutrientKey,
    input.targetPerDay,
  );
  return NextResponse.json({ ok: true });
});
