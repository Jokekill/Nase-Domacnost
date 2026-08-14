import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { diaryEntries } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { diaryEntryPatchSchema } from "@/lib/schemas/diary";

type Params = { params: Promise<{ id: string }> };

/** Diary rows are strictly per user — the scope below is the whole guard. */
export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const input = diaryEntryPatchSchema.parse(await req.json());
  const updated = await db
    .update(diaryEntries)
    .set({ ...input, lastModifiedBy: ctx.user.id })
    .where(
      and(eq(diaryEntries.id, id), eq(diaryEntries.userId, ctx.user.id)),
    )
    .returning({ id: diaryEntries.id });
  if (!updated.length) throw new ApiError("not_found", "Záznam nenalezen.");
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    const updated = await db
      .update(diaryEntries)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(
        and(eq(diaryEntries.id, id), eq(diaryEntries.userId, ctx.user.id)),
      )
      .returning({ id: diaryEntries.id });
    if (!updated.length) throw new ApiError("not_found", "Záznam nenalezen.");
    return NextResponse.json({ ok: true });
  },
);
