import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { listMealPlan } from "@/lib/planning/meal-plan";
import { rangeQuerySchema } from "@/lib/schemas/planning";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { from, to } = rangeQuerySchema.parse({
    from: req.nextUrl.searchParams.get("from"),
    to: req.nextUrl.searchParams.get("to"),
  });
  const items = await listMealPlan(ctx.householdId, from, to);
  return NextResponse.json({ items });
});
