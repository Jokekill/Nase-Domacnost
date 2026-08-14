import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "@/db/client";
import {
  taskAssignees,
  taskCompletionHistory,
  taskLists,
  taskTemplates,
  tasks,
  templateGroups,
  users,
} from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import {
  suggestOccasionalTasks,
  type SuggestionTemplate,
} from "@/lib/domain/task-suggestions";

type Actor = { userId: string; householdId: string };

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function listTasks(
  householdId: string,
  filters: {
    from?: string;
    to?: string;
    listId?: string;
    status?: "open" | "done";
  } = {},
) {
  const conditions = [
    eq(tasks.householdId, householdId),
    isNull(tasks.deletedAt),
  ];
  if (filters.listId) conditions.push(eq(tasks.taskListId, filters.listId));
  if (filters.status) conditions.push(eq(tasks.status, filters.status));
  if (filters.from && filters.to) {
    // A task belongs to the window if its period overlaps it, or it has no
    // dates at all (a floating "sometime" task).
    conditions.push(
      or(
        and(
          gte(tasks.periodEnd, filters.from),
          lte(tasks.periodStart, filters.to),
        ),
        and(isNull(tasks.periodStart), isNull(tasks.periodEnd)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: tasks.id,
      taskListId: tasks.taskListId,
      taskListName: taskLists.name,
      templateId: tasks.templateId,
      name: tasks.name,
      description: tasks.description,
      periodStart: tasks.periodStart,
      periodEnd: tasks.periodEnd,
      dueAt: tasks.dueAt,
      status: tasks.status,
      completedAt: tasks.completedAt,
      completedBy: tasks.completedBy,
      completedByName: users.displayName,
    })
    .from(tasks)
    .leftJoin(taskLists, eq(taskLists.id, tasks.taskListId))
    .leftJoin(users, eq(users.id, tasks.completedBy))
    .where(and(...conditions))
    .orderBy(
      asc(tasks.status),
      sql`${tasks.periodStart} ASC NULLS LAST`,
      asc(tasks.name),
    );

  const assignees = rows.length
    ? await db
        .select({
          taskId: taskAssignees.taskId,
          userId: taskAssignees.userId,
          displayName: users.displayName,
        })
        .from(taskAssignees)
        .innerJoin(users, eq(users.id, taskAssignees.userId))
        .where(
          inArray(
            taskAssignees.taskId,
            rows.map((r) => r.id),
          ),
        )
    : [];

  return rows.map((row) => ({
    ...row,
    assignees: assignees
      .filter((a) => a.taskId === row.id)
      .map((a) => ({ userId: a.userId, displayName: a.displayName })),
  }));
}

export async function listTemplates(householdId: string) {
  return db
    .select({
      id: taskTemplates.id,
      name: taskTemplates.name,
      description: taskTemplates.description,
      intervalDays: taskTemplates.intervalDays,
      taskListId: taskTemplates.taskListId,
      templateGroupId: taskTemplates.templateGroupId,
      groupName: templateGroups.name,
      sortOrder: taskTemplates.sortOrder,
      lastCompletedAt: sql<string | null>`(
        SELECT max(h.completed_at) FROM task_completion_history h
        WHERE h.template_id = "task_templates"."id"
      )`.as("last_completed_at"),
    })
    .from(taskTemplates)
    .leftJoin(
      templateGroups,
      eq(templateGroups.id, taskTemplates.templateGroupId),
    )
    .where(
      and(
        eq(taskTemplates.householdId, householdId),
        isNull(taskTemplates.deletedAt),
      ),
    )
    .orderBy(asc(taskTemplates.sortOrder), asc(taskTemplates.name));
}

/* ------------------------------------------------------------------ */
/* Creating a concrete cleanup (zadání §10.5)                         */
/* ------------------------------------------------------------------ */

export type CreateTasksInput = {
  taskListId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Templates to instantiate — each becomes an independent task copy. */
  templateIds?: string[];
  /** Ad-hoc tasks typed by the user ("Vyčistit kávovar"). */
  customNames?: string[];
};

export async function createTasks(
  actor: Actor,
  input: CreateTasksInput,
): Promise<{ created: string[] }> {
  const templateRows = input.templateIds?.length
    ? await db
        .select()
        .from(taskTemplates)
        .where(
          and(
            inArray(taskTemplates.id, input.templateIds),
            eq(taskTemplates.householdId, actor.householdId),
            isNull(taskTemplates.deletedAt),
          ),
        )
    : [];

  const created: string[] = [];
  const values = [
    ...templateRows.map((template) => ({
      id: uuidv7(),
      householdId: actor.householdId,
      taskListId: input.taskListId ?? template.taskListId ?? null,
      templateId: template.id,
      // Copied, not referenced: editing the template later must not rewrite
      // an already-created task (zadání §5.5).
      name: template.name,
      description: template.description,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      status: "open" as const,
      lastModifiedBy: actor.userId,
    })),
    ...(input.customNames ?? [])
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        id: uuidv7(),
        householdId: actor.householdId,
        taskListId: input.taskListId ?? null,
        templateId: null,
        name,
        description: null,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        status: "open" as const,
        lastModifiedBy: actor.userId,
      })),
  ];

  if (values.length === 0) {
    throw new ApiError("validation_error", "Nevybral jsi žádné úkoly.");
  }

  await db.insert(tasks).values(values);
  created.push(...values.map((v) => v.id));
  return { created };
}

/* ------------------------------------------------------------------ */
/* Assignment                                                         */
/* ------------------------------------------------------------------ */

/**
 * Bulk assign: pick a person, tick their tasks, confirm (zadání §10.5).
 * `mode: "replace"` swaps the whole assignee set, `"add"` appends.
 */
export async function assignTasks(
  actor: Actor,
  taskIds: string[],
  userId: string,
  mode: "add" | "replace" = "add",
): Promise<void> {
  const owned = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        inArray(tasks.id, taskIds),
        eq(tasks.householdId, actor.householdId),
        isNull(tasks.deletedAt),
      ),
    );
  if (owned.length === 0) throw new ApiError("not_found", "Úkoly nenalezeny.");
  const ids = owned.map((t) => t.id);

  await db.transaction(async (tx) => {
    if (mode === "replace") {
      await tx.delete(taskAssignees).where(inArray(taskAssignees.taskId, ids));
    }
    await tx
      .insert(taskAssignees)
      .values(ids.map((taskId) => ({ taskId, userId })))
      .onConflictDoNothing();
    // Touch the parents so the M:N change reaches change_log (§1.3).
    await tx
      .update(tasks)
      .set({ lastModifiedBy: actor.userId })
      .where(inArray(tasks.id, ids));
  });
}

export async function unassignTask(
  actor: Actor,
  taskId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)),
    );
  await db
    .update(tasks)
    .set({ lastModifiedBy: actor.userId })
    .where(
      and(eq(tasks.id, taskId), eq(tasks.householdId, actor.householdId)),
    );
}

/* ------------------------------------------------------------------ */
/* Completion                                                         */
/* ------------------------------------------------------------------ */

/**
 * Completion is a property of the TASK, not of an assignment: anyone may tick
 * a task off and it is then done for everyone, but we record who did it
 * (zadání §10.5).
 */
export async function setTaskCompletion(
  actor: Actor,
  taskId: string,
  done: boolean,
): Promise<void> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.householdId, actor.householdId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) throw new ApiError("not_found", "Úkol nenalezen.");

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        status: done ? "done" : "open",
        completedAt: done ? new Date() : null,
        completedBy: done ? actor.userId : null,
        lastModifiedBy: actor.userId,
      })
      .where(eq(tasks.id, taskId));

    if (done && task.templateId && task.status !== "done") {
      await tx.insert(taskCompletionHistory).values({
        id: uuidv7(),
        householdId: actor.householdId,
        templateId: task.templateId,
        taskId,
        completedAt: new Date(),
        completedBy: actor.userId,
      });
    }
    if (!done && task.templateId) {
      // Un-ticking removes the newest history entry so the "last done" date
      // stays truthful.
      const [latest] = await tx
        .select({ id: taskCompletionHistory.id })
        .from(taskCompletionHistory)
        .where(eq(taskCompletionHistory.taskId, taskId))
        .orderBy(desc(taskCompletionHistory.completedAt))
        .limit(1);
      if (latest) {
        await tx
          .delete(taskCompletionHistory)
          .where(eq(taskCompletionHistory.id, latest.id));
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Occasional-task suggestions                                        */
/* ------------------------------------------------------------------ */

export async function getTaskSuggestions(
  householdId: string,
  maxPerPeriod?: number,
) {
  const rows = await db
    .select({
      templateId: taskTemplates.id,
      name: taskTemplates.name,
      intervalDays: taskTemplates.intervalDays,
      createdAt: taskTemplates.createdAt,
      lastCompletedAt: sql<string | null>`(
        SELECT max(h.completed_at) FROM task_completion_history h
        WHERE h.template_id = "task_templates"."id"
      )`.as("last_completed_at"),
      openTasks: sql<number>`(
        SELECT count(*)::int FROM tasks t
        WHERE t.template_id = "task_templates"."id"
          AND t.deleted_at IS NULL AND t.status = 'open'
      )`.as("open_tasks"),
    })
    .from(taskTemplates)
    .where(
      and(
        eq(taskTemplates.householdId, householdId),
        isNull(taskTemplates.deletedAt),
        sql`${taskTemplates.intervalDays} IS NOT NULL`,
      ),
    );

  const templates: SuggestionTemplate[] = rows.map((row) => ({
    templateId: row.templateId,
    name: row.name,
    intervalDays: row.intervalDays,
    createdAt: row.createdAt,
    lastCompletedAt: row.lastCompletedAt
      ? new Date(row.lastCompletedAt)
      : null,
    hasOpenTask: row.openTasks > 0,
  }));

  return suggestOccasionalTasks(templates, new Date(), maxPerPeriod);
}
