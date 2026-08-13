import { and, eq, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { mealPlanEntries, mealTypes } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

type Params = { params: Promise<{ id: string }> };

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);

    const [used] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mealPlanEntries)
      .where(
        and(
          eq(mealPlanEntries.mealTypeId, id),
          isNull(mealPlanEntries.deletedAt),
        ),
      );
    if (used.count > 0) {
      throw new ApiError(
        "conflict",
        `Tento typ jídla používá ${used.count} položek jídelníčku.`,
      );
    }

    const updated = await db
      .update(mealTypes)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(
        and(eq(mealTypes.id, id), eq(mealTypes.householdId, ctx.householdId)),
      )
      .returning({ id: mealTypes.id });
    if (!updated.length) throw new ApiError("not_found", "Typ jídla nenalezen.");
    return NextResponse.json({ ok: true });
  },
);
