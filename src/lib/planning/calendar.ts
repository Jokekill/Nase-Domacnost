import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEventOverrides,
  calendarEvents,
  mealPlanEntries,
  mealTypes,
  recipes,
  shoppingLists,
  tasks,
} from "@/db/schema";
import { dateKey, expandOccurrences } from "@/lib/domain/recurrence";

export type CalendarItem =
  | {
      kind: "meal";
      id: string;
      date: string;
      title: string;
      detail: string | null;
      recipeId: string | null;
    }
  | {
      kind: "event";
      id: string;
      date: string;
      title: string;
      detail: string | null;
      startsAt: string;
      allDay: boolean;
      isRecurring: boolean;
    }
  | {
      kind: "task";
      id: string;
      /** Tasks may span a period rather than sit on one day (zadání §10.3). */
      periodStart: string | null;
      periodEnd: string | null;
      date: string | null;
      title: string;
      done: boolean;
    }
  | {
      kind: "shopping";
      id: string;
      periodStart: string;
      periodEnd: string;
      title: string;
    };

/**
 * One aggregated view over everything that happens in a date range: meals,
 * events (with recurrences expanded), tasks and shopping periods.
 */
export async function getCalendar(
  householdId: string,
  from: string,
  to: string,
): Promise<{ items: CalendarItem[] }> {
  const rangeStart = new Date(`${from}T00:00:00`);
  const rangeEnd = new Date(`${to}T23:59:59.999`);

  const [meals, events, overrides, taskRows, shoppingRows] = await Promise.all([
    db
      .select({
        id: mealPlanEntries.id,
        date: mealPlanEntries.date,
        mealTypeName: mealTypes.name,
        mealTypeOrder: mealTypes.sortOrder,
        recipeId: mealPlanEntries.recipeId,
        recipeTitle: recipes.title,
        freeText: mealPlanEntries.freeText,
      })
      .from(mealPlanEntries)
      .innerJoin(mealTypes, eq(mealTypes.id, mealPlanEntries.mealTypeId))
      .leftJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
      .where(
        and(
          eq(mealPlanEntries.householdId, householdId),
          isNull(mealPlanEntries.deletedAt),
          gte(mealPlanEntries.date, from),
          lte(mealPlanEntries.date, to),
        ),
      ),
    db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.householdId, householdId),
          isNull(calendarEvents.deletedAt),
          // Recurring events may start long before the range.
          or(
            lte(calendarEvents.startsAt, rangeEnd),
            sql`${calendarEvents.rrule} IS NOT NULL`,
          ),
        ),
      ),
    db
      .select()
      .from(calendarEventOverrides)
      .where(
        and(
          eq(calendarEventOverrides.householdId, householdId),
          isNull(calendarEventOverrides.deletedAt),
        ),
      ),
    db
      .select({
        id: tasks.id,
        name: tasks.name,
        periodStart: tasks.periodStart,
        periodEnd: tasks.periodEnd,
        dueAt: tasks.dueAt,
        status: tasks.status,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.householdId, householdId),
          isNull(tasks.deletedAt),
          or(
            and(
              gte(tasks.periodEnd, from),
              lte(tasks.periodStart, to),
            ),
            and(isNull(tasks.periodStart), isNull(tasks.periodEnd)),
          ),
        ),
      ),
    db
      .select({
        id: shoppingLists.id,
        name: shoppingLists.name,
        periodStart: shoppingLists.periodStart,
        periodEnd: shoppingLists.periodEnd,
      })
      .from(shoppingLists)
      .where(
        and(
          eq(shoppingLists.householdId, householdId),
          isNull(shoppingLists.deletedAt),
          gte(shoppingLists.periodEnd, from),
          lte(shoppingLists.periodStart, to),
        ),
      ),
  ]);

  const items: CalendarItem[] = [];

  for (const meal of meals) {
    items.push({
      kind: "meal",
      id: meal.id,
      date: meal.date,
      title: meal.recipeTitle ?? meal.freeText ?? "",
      detail: meal.mealTypeName,
      recipeId: meal.recipeId,
    });
  }

  for (const event of events) {
    const eventOverrides = overrides.filter((o) => o.eventId === event.id);
    const occurrences = expandOccurrences(
      event.startsAt,
      event.rrule,
      rangeStart,
      rangeEnd,
    );
    for (const occurrence of occurrences) {
      const key = dateKey(occurrence);
      const override = eventOverrides.find((o) => o.occurrenceDate === key);
      if (override?.isCancelled) continue;
      const patch = (override?.override ?? null) as {
        title?: string;
        startsAt?: string;
      } | null;
      const startsAt = patch?.startsAt ? new Date(patch.startsAt) : occurrence;
      items.push({
        kind: "event",
        // Occurrence-scoped id so the UI can address a single instance.
        id: `${event.id}:${key}`,
        date: dateKey(startsAt),
        title: patch?.title ?? event.title,
        detail: event.description,
        startsAt: startsAt.toISOString(),
        allDay: event.allDay,
        isRecurring: Boolean(event.rrule),
      });
    }
  }

  for (const task of taskRows) {
    items.push({
      kind: "task",
      id: task.id,
      periodStart: task.periodStart,
      periodEnd: task.periodEnd,
      date: task.dueAt ? dateKey(task.dueAt) : (task.periodStart ?? null),
      title: task.name,
      done: task.status === "done",
    });
  }

  for (const list of shoppingRows) {
    items.push({
      kind: "shopping",
      id: list.id,
      periodStart: list.periodStart,
      periodEnd: list.periodEnd,
      title: list.name,
    });
  }

  return { items };
}
