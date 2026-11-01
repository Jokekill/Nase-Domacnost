import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { rohlikMatchSchema } from "@/lib/schemas/rohlik";
import { matchList } from "@/lib/rohlik/service";

/**
 * The review step of "do Rohlíku": what the list needs, what Rohlík offers
 * and how many packages that is (D-029). Reads only — nothing is ordered and
 * no pairing is remembered until the basket is actually pushed.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { listId } = rohlikMatchSchema.parse(await req.json());
  const result = await matchList(ctx.householdId, listId);
  return NextResponse.json(result);
});
