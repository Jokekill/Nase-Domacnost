import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { calendarEvents } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";
import { parseRrule } from "@/lib/domain/recurrence";
import { calendarEventSchema } from "@/lib/schemas/planning";

export const POST = apiHandler(async (req: NextRequest) => {
  const ctx = await requireHousehold();
  const input = calendarEventSchema.parse(await req.json());

  if (input.rrule && !parseRrule(input.rrule)) {
    throw new ApiError("validation_error", "Nepodporované pravidlo opakování.");
  }

  await db
    .insert(calendarEvents)
    .values({
      id: input.id,
      householdId: ctx.householdId,
      title: input.title,
      description: input.description ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      allDay: input.allDay,
      rrule: input.rrule ?? null,
      lastModifiedBy: ctx.user.id,
    })
    .onConflictDoNothing();
  return NextResponse.json({ id: input.id }, { status: 201 });
});
