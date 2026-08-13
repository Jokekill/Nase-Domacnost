import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { shoppingItems } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ checked: z.boolean() });

/**
 * Idempotent check/uncheck — the offline outbox may replay it (docs/SYNC.md
 * §4.2: checking off always wins in a conflict).
 */
export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const { checked } = bodySchema.parse(await req.json());

  const updated = await db
    .update(shoppingItems)
    .set({
      isChecked: checked,
      checkedAt: checked ? new Date() : null,
      checkedBy: checked ? ctx.user.id : null,
      lastModifiedBy: ctx.user.id,
    })
    .where(
      and(
        eq(shoppingItems.id, id),
        eq(shoppingItems.householdId, ctx.householdId),
      ),
    )
    .returning({ id: shoppingItems.id, isChecked: shoppingItems.isChecked });
  if (!updated.length) throw new ApiError("not_found", "Položka nenalezena.");
  return NextResponse.json({ ok: true, isChecked: updated[0].isChecked });
});
