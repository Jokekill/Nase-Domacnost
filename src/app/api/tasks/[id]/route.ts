import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { taskPatchSchema } from "@/lib/schemas/tasks";

type Params = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const { dueAt, ...rest } = taskPatchSchema.parse(await req.json());
  const updated = await db
    .update(tasks)
    .set({
      ...rest,
      ...(dueAt !== undefined
        ? { dueAt: dueAt ? new Date(dueAt) : null }
        : {}),
      lastModifiedBy: ctx.user.id,
    })
    .where(and(eq(tasks.id, id), eq(tasks.householdId, ctx.householdId)))
    .returning({ id: tasks.id });
  if (!updated.length) throw new ApiError("not_found", "Úkol nenalezen.");
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    const updated = await db
      .update(tasks)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(and(eq(tasks.id, id), eq(tasks.householdId, ctx.householdId)))
      .returning({ id: tasks.id });
    if (!updated.length) throw new ApiError("not_found", "Úkol nenalezen.");
    return NextResponse.json({ ok: true });
  },
);
