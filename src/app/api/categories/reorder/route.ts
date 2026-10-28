import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { reorderCategories } from "@/lib/categories/service";

const schema = z.object({
  items: z
    .array(
      z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) }),
    )
    .max(500),
});

/** The whole new order at once — see reorderCategories. */
export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const { items } = schema.parse(await req.json());
  await reorderCategories(
    { userId: ctx.user.id, householdId: ctx.householdId },
    items,
  );
  return NextResponse.json({ ok: true });
});
