import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { rohlikCartSchema } from "@/lib/schemas/rohlik";
import { pushToCart } from "@/lib/rohlik/service";

/**
 * Puts the reviewed lines in the household's Rohlík basket (D-029).
 *
 * Adds only — it never empties the basket and never places an order, so the
 * last word stays with whoever opens rohlik.cz and clicks through checkout.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { lines } = rohlikCartSchema.parse(await req.json());
  const result = await pushToCart(
    { userId: ctx.user.id, householdId: ctx.householdId },
    lines,
  );
  return NextResponse.json(result);
});
