import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { tags } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

type Params = { params: Promise<{ id: string }> };

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    const updated = await db
      .update(tags)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(and(eq(tags.id, id), eq(tags.householdId, ctx.householdId)))
      .returning({ id: tags.id });
    if (!updated.length) throw new ApiError("not_found", "Tag nenalezen.");
    return NextResponse.json({ ok: true });
  },
);
