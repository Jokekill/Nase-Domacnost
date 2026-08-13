import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { db } from "@/db/client";
import {
  mealPlanEntries,
  prepTaskSuggestions,
  recipePrepAhead,
  recipes,
  taskLists,
  tasks,
} from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api/errors";
import { requireHousehold } from "@/lib/auth/guards";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["accept", "dismiss"]),
  /** Optional tweak before accepting (zadání §10.2: přijmout / upravit). */
  name: z.string().trim().min(1).max(200).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = z.string().uuid().parse((await params).id);
  const input = bodySchema.parse(await req.json());

  const [suggestion] = await db
    .select({
      id: prepTaskSuggestions.id,
      status: prepTaskSuggestions.status,
      suggestedFor: prepTaskSuggestions.suggestedFor,
      description: recipePrepAhead.description,
      recipeTitle: recipes.title,
    })
    .from(prepTaskSuggestions)
    .innerJoin(
      recipePrepAhead,
      eq(recipePrepAhead.id, prepTaskSuggestions.recipePrepAheadId),
    )
    .innerJoin(
      mealPlanEntries,
      eq(mealPlanEntries.id, prepTaskSuggestions.mealPlanEntryId),
    )
    .leftJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
    .where(
      and(
        eq(prepTaskSuggestions.id, id),
        eq(prepTaskSuggestions.householdId, ctx.householdId),
        isNull(prepTaskSuggestions.deletedAt),
      ),
    )
    .limit(1);
  if (!suggestion) throw new ApiError("not_found", "Návrh nenalezen.");

  if (input.action === "dismiss") {
    await db
      .update(prepTaskSuggestions)
      .set({ status: "dismissed", lastModifiedBy: ctx.user.id })
      .where(eq(prepTaskSuggestions.id, id));
    return NextResponse.json({ ok: true });
  }

  if (suggestion.status === "accepted") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  // Accepting creates a real task so it shows up in the calendar right away;
  // the full task module arrives in Phase 6.
  const [list] = await db
    .select({ id: taskLists.id })
    .from(taskLists)
    .where(
      and(eq(taskLists.householdId, ctx.householdId), isNull(taskLists.deletedAt)),
    )
    .limit(1);

  const taskId = uuidv7();
  const dueDate = input.date ?? suggestion.suggestedFor;
  await db.transaction(async (tx) => {
    await tx.insert(tasks).values({
      id: taskId,
      householdId: ctx.householdId,
      taskListId: list?.id ?? null,
      name:
        input.name ??
        `${suggestion.description}${suggestion.recipeTitle ? ` (${suggestion.recipeTitle})` : ""}`,
      periodStart: dueDate,
      periodEnd: dueDate,
      status: "open",
      lastModifiedBy: ctx.user.id,
    });
    await tx
      .update(prepTaskSuggestions)
      .set({
        status: "accepted",
        taskId,
        suggestedFor: dueDate,
        lastModifiedBy: ctx.user.id,
      })
      .where(eq(prepTaskSuggestions.id, id));
  });

  return NextResponse.json({ ok: true, taskId }, { status: 201 });
});
