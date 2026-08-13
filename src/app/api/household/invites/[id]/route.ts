import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { householdInvites } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/guards";

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireAdmin();
    const id = z.string().uuid().parse((await params).id);
    const deleted = await db
      .delete(householdInvites)
      .where(
        and(
          eq(householdInvites.id, id),
          eq(householdInvites.householdId, ctx.householdId),
        ),
      )
      .returning({ id: householdInvites.id });
    if (deleted.length === 0) {
      throw new ApiError("not_found", "Pozvánka nenalezena.");
    }
    return NextResponse.json({ ok: true });
  },
);
