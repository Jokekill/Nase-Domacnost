import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { getDiarySummary, listGoals } from "@/lib/diary/service";
import { diaryRangeSchema } from "@/lib/schemas/diary";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { from, to } = diaryRangeSchema.parse({
    from: req.nextUrl.searchParams.get("from"),
    to: req.nextUrl.searchParams.get("to"),
  });
  const actor = { userId: ctx.user.id, householdId: ctx.householdId };
  const [summary, goals] = await Promise.all([
    getDiarySummary(actor, from, to),
    listGoals(actor),
  ]);
  return NextResponse.json({ ...summary, goals });
});
