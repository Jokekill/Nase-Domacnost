import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { db } from "@/db/client";
import { calendarEventOverrides, calendarEvents } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { eventOverrideSchema } from "@/lib/schemas/planning";

type Params = { params: Promise<{ id: string; date: string }> };

/** Cancels or edits a single occurrence of a recurring event. */
export const PUT = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const { id: rawId, date: rawDate } = await params;
  const eventId = z.string().uuid().parse(rawId);
  const occurrenceDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(rawDate);
  const input = eventOverrideSchema.parse(await req.json());

  const [event] = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.householdId, ctx.householdId),
      ),
    )
    .limit(1);
  if (!event) throw new ApiError("not_found", "Událost nenalezena.");

  await db
    .insert(calendarEventOverrides)
    .values({
      id: uuidv7(),
      householdId: ctx.householdId,
      eventId,
      occurrenceDate,
      isCancelled: input.isCancelled,
      override: input.override ?? null,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoUpdate({
      target: [
        calendarEventOverrides.eventId,
        calendarEventOverrides.occurrenceDate,
      ],
      set: {
        isCancelled: input.isCancelled,
        override: input.override ?? null,
        deletedAt: null,
        lastModifiedBy: ctx.user.id,
      },
    });
  return NextResponse.json({ ok: true });
});
