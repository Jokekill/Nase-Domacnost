import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { getCalendar } from "@/lib/planning/calendar";
import { rangeQuerySchema } from "@/lib/schemas/planning";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { from, to } = rangeQuerySchema.parse({
    from: req.nextUrl.searchParams.get("from"),
    to: req.nextUrl.searchParams.get("to"),
  });
  return NextResponse.json(await getCalendar(ctx.householdId, from, to));
});
