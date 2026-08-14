import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { getTaskSuggestions } from "@/lib/tasks/service";

export const GET = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const max = z.coerce
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .parse(req.nextUrl.searchParams.get("max") ?? undefined);
  const items = await getTaskSuggestions(ctx.householdId, max);
  return NextResponse.json({ items });
});
