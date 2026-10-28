import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { getCookbookOverview } from "@/lib/categories/service";

/** Chapters for the cookbook's front page, with counts and cover photos. */
export const GET = apiHandler(async () => {
  const ctx = await requireHousehold();
  const overview = await getCookbookOverview({
    userId: ctx.user.id,
    householdId: ctx.householdId,
  });
  return NextResponse.json(overview);
});
