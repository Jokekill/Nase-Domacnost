import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { copyFromMealPlan } from "@/lib/diary/service";
import { fromMealPlanSchema } from "@/lib/schemas/diary";

/** Explicit copy from the plan — never triggered automatically (§10.6). */
export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = fromMealPlanSchema.parse(await req.json());
  const result = await copyFromMealPlan(
    { userId: ctx.user.id, householdId: ctx.householdId },
    input.entryIds,
    input.servings,
  );
  return NextResponse.json(result, { status: 201 });
});
