import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { calendarEvents } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { parseRrule } from "@/lib/domain/recurrence";
import { calendarEventPatchSchema } from "@/lib/schemas/planning";

type Params = { params: Promise<{ id: string }> };

export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const input = calendarEventPatchSchema.parse(await req.json());
  if (input.rrule && !parseRrule(input.rrule)) {
    throw new ApiError("validation_error", "Nepodporované pravidlo opakování.");
  }

  const updated = await db
    .update(calendarEvents)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
      ...(input.endsAt !== undefined
        ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
        : {}),
      ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
      ...(input.rrule !== undefined ? { rrule: input.rrule } : {}),
      lastModifiedBy: ctx.user.id,
    })
    .where(
      and(
        eq(calendarEvents.id, id),
        eq(calendarEvents.householdId, ctx.householdId),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .returning({ id: calendarEvents.id });
  if (!updated.length) throw new ApiError("not_found", "Událost nenalezena.");
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(
  async (_req: NextRequest, { params }: Params) => {
    const ctx = await requireHousehold();
    const id = z.string().uuid().parse((await params).id);
    const updated = await db
      .update(calendarEvents)
      .set({ deletedAt: new Date(), lastModifiedBy: ctx.user.id })
      .where(
        and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.householdId, ctx.householdId),
        ),
      )
      .returning({ id: calendarEvents.id });
    if (!updated.length) throw new ApiError("not_found", "Událost nenalezena.");
    return NextResponse.json({ ok: true });
  },
);
