import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { listDiary } from "@/lib/diary/service";
import { diaryRangeSchema } from "@/lib/schemas/diary";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { from, to } = diaryRangeSchema.parse({
    from: req.nextUrl.searchParams.get("from"),
    to: req.nextUrl.searchParams.get("to"),
  });
  const items = await listDiary(
    { userId: ctx.user.id, householdId: ctx.householdId },
    from,
    to,
  );
  return NextResponse.json({ items });
});
