import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { taskTemplates } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

type Params = { params: Promise<{ id: string }> };

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    // Already-created tasks keep their own copy, so removing a template never
    // touches history (zadání §5.5).
    const updated = await db
      .update(taskTemplates)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(
        and(
          eq(taskTemplates.id, id),
          eq(taskTemplates.householdId, ctx.householdId),
        ),
      )
      .returning({ id: taskTemplates.id });
    if (!updated.length) throw new ApiError("not_found", "Šablona nenalezena.");
    return NextResponse.json({ ok: true });
  },
);
