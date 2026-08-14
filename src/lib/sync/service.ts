import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { changeLog, syncAppliedOps, taskAssignees } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import type { HouseholdContext } from "@/lib/auth/guards";
import { recordCompletionHistory } from "@/lib/tasks/service";
import {
  effectiveTimestamp,
  mergeRow,
  type FieldMtimes,
} from "@/lib/domain/sync-merge";
import { SYNC_ENTITIES, isSyncEntity, type SyncEntity } from "./registry";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Pull                                                               */
/* ------------------------------------------------------------------ */

export type PullChange = { table: string; op: string; row: Row };

/**
 * Changes since the client's cursor (docs/SYNC.md §2). The cursor is the
 * server-side `change_log.seq` — never a timestamp, client clocks lie.
 */
export async function pullChanges(
  ctx: HouseholdContext,
  cursor: number,
  limit: number,
): Promise<{ changes: PullChange[]; nextCursor: number; hasMore: boolean }> {
  // A cursor that predates the retention window cannot be served: the client
  // would silently miss whatever was pruned, so it must re-bootstrap.
  if (cursor > 0) {
    const [older] = await db
      .select({ seq: changeLog.seq })
      .from(changeLog)
      .where(
        and(
          eq(changeLog.householdId, ctx.householdId),
          lte(changeLog.seq, cursor),
        ),
      )
      .limit(1);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(changeLog)
      .where(eq(changeLog.householdId, ctx.householdId));
    if (!older && count > 0) {
      throw new ApiError(
        "conflict",
        "Kurzor je starší než historie změn — je potřeba stáhnout data znovu.",
        { code: "cursor_expired" },
      );
    }
  }

  const entries = await db
    .select({
      seq: changeLog.seq,
      tableName: changeLog.tableName,
      rowId: changeLog.rowId,
      op: changeLog.op,
    })
    .from(changeLog)
    .where(
      and(
        eq(changeLog.householdId, ctx.householdId),
        gt(changeLog.seq, cursor),
      ),
    )
    .orderBy(asc(changeLog.seq))
    .limit(limit + 1);

  const hasMore = entries.length > limit;
  const page = entries.slice(0, limit);
  const nextCursor = page.length ? page[page.length - 1].seq : cursor;

  // Collapse repeated changes to the same row: the client gets current state,
  // so the last op per row is all that matters.
  const wanted = new Map<
    string,
    { table: string; op: string; ids: string[] }
  >();
  const lastOpPerRow = new Map<string, string>();
  for (const entry of page) {
    if (!isSyncEntity(entry.tableName)) continue;
    lastOpPerRow.set(`${entry.tableName}:${entry.rowId}`, entry.op);
  }
  for (const key of lastOpPerRow.keys()) {
    const [table, rowId] = key.split(":");
    const bucket = wanted.get(table) ?? { table, op: "update", ids: [] };
    bucket.ids.push(rowId);
    wanted.set(table, bucket);
  }

  const changes: PullChange[] = [];
  for (const { table, ids } of wanted.values()) {
    const entity = SYNC_ENTITIES[table];
    const rows = await loadRows(entity, ctx, ids, table);
    for (const row of rows) {
      const op = lastOpPerRow.get(`${table}:${row.id as string}`) ?? "update";
      changes.push({ table, op, row: serialize(row) });
    }
  }

  return { changes, nextCursor, hasMore };
}

/** Full mirror bootstrap: everything visible, plus the current cursor. */
export async function bootstrapSnapshot(
  ctx: HouseholdContext,
): Promise<{ tables: Record<string, Row[]>; cursor: number }> {
  const [{ seq }] = await db
    .select({ seq: sql<number>`coalesce(max(seq), 0)::int` })
    .from(changeLog)
    .where(eq(changeLog.householdId, ctx.householdId));

  // Twenty independent SELECTs — run them together. Sequentially this is the
  // slowest endpoint in the app (~220 ms here, and a Pi is no laptop), and it
  // is what a new device waits for before it can show anything.
  const loaded = await Promise.all(
    Object.entries(SYNC_ENTITIES).map(async ([name, entity]) => {
      const rows = await loadRows(entity, ctx, null, name);
      return [name, rows.map(serialize)] as const;
    }),
  );

  return { tables: Object.fromEntries(loaded), cursor: seq ?? 0 };
}

async function loadRows(
  entity: SyncEntity,
  ctx: HouseholdContext,
  ids: string[] | null,
  name: string,
): Promise<Row[]> {
  const table = entity.table as unknown as Record<string, never>;
  const conditions = [eq(table.householdId, ctx.householdId as never)];
  // The personal diary is never mirrored to anyone else's device.
  if (entity.perUser) {
    conditions.push(eq(table.userId, ctx.user.id as never));
  }
  if (ids) {
    conditions.push(inArray(table.id, ids as never));
  }
  const rows = (await db
    .select()
    .from(entity.table)
    .where(and(...conditions))) as Row[];

  // Someone else's private recipe is not part of my mirror even though it
  // lives in my household (docs/ARCHITECTURE.md §2.2).
  const visible = rows.filter(
    (row) =>
      !(
        "visibility" in row &&
        row.visibility === "private" &&
        row.ownerId !== ctx.user.id
      ),
  );

  return withLinks(visible, name);
}

/**
 * M:N links travel inside the parent row (docs/SYNC.md §2) — the assignment
 * endpoints already touch the parent, so a changed link reaches change_log.
 * Without this the offline task list cannot tell "moje" from "ostatní".
 */
async function withLinks(rows: Row[], name: string): Promise<Row[]> {
  if (name !== "tasks" || rows.length === 0) return rows;

  const links = await db
    .select()
    .from(taskAssignees)
    .where(
      inArray(
        taskAssignees.taskId,
        rows.map((row) => row.id as string),
      ),
    );
  return rows.map((row) => ({
    ...row,
    assigneeIds: links
      .filter((link) => link.taskId === row.id)
      .map((link) => link.userId),
  }));
}

/** Dates → ISO strings; everything else passes through as-is. */
function serialize(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Push                                                               */
/* ------------------------------------------------------------------ */

export type PushOp = {
  opId: string;
  entity: string;
  entityId: string;
  op: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  clientTs: string;
};

export type PushResult = {
  opId: string;
  status: "applied" | "already_applied" | "merged_partial" | "rejected";
  discardedFields?: string[];
  reason?: string;
};

/**
 * Applies a batch of offline operations (docs/SYNC.md §3). Each op runs in its
 * own transaction — one bad operation must not take the batch down with it.
 */
export async function pushOps(
  ctx: HouseholdContext,
  ops: PushOp[],
): Promise<PushResult[]> {
  const results: PushResult[] = [];
  for (const op of ops) {
    try {
      results.push(await applyOp(ctx, op));
    } catch (err) {
      results.push({
        opId: op.opId,
        status: "rejected",
        reason: err instanceof ApiError ? err.message : "internal_error",
      });
    }
  }
  return results;
}

async function applyOp(ctx: HouseholdContext, op: PushOp): Promise<PushResult> {
  // Idempotence first: a replay returns the stored answer, changes nothing.
  const [seen] = await db
    .select({ result: syncAppliedOps.result })
    .from(syncAppliedOps)
    .where(eq(syncAppliedOps.opId, op.opId))
    .limit(1);
  if (seen) {
    return { ...(seen.result as PushResult), status: "already_applied" };
  }

  const entity = SYNC_ENTITIES[op.entity];
  if (!entity?.writable) {
    return {
      opId: op.opId,
      status: "rejected",
      reason: "entity_not_writable_offline",
    };
  }

  // Whitelist: anything the client sends beyond the allowed fields is dropped
  // before it can reach the database.
  const allowed = new Set(entity.writableFields ?? []);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(op.payload)) {
    if (allowed.has(key)) payload[key] = revive(key, value);
  }
  if (op.op === "delete") payload.deletedAt = new Date();

  const table = entity.table as unknown as Record<string, never>;
  const conditions = [
    eq(table.id, op.entityId as never),
    eq(table.householdId, ctx.householdId as never),
  ];
  if (entity.perUser) conditions.push(eq(table.userId, ctx.user.id as never));

  const [current] = (await db
    .select()
    .from(entity.table)
    .where(and(...conditions))
    .limit(1)) as Row[];

  if (!current) {
    // Offline inserts of new rows are not supported for these entities: they
    // are all created online (a shopping item comes from an import, a task
    // from the cleaning wizard). Nothing is lost — the client keeps the op.
    const result: PushResult = {
      opId: op.opId,
      status: "rejected",
      reason: "row_not_found",
    };
    await remember(ctx, op, result);
    return result;
  }

  const merged = mergeRow({
    current,
    fieldMtimes: (current.fieldMtimes as FieldMtimes) ?? {},
    payload,
    effectiveTs: effectiveTimestamp(new Date(op.clientTs), new Date()),
    entity: op.entity,
  });

  if (merged.status === "rejected") {
    const result: PushResult = {
      opId: op.opId,
      status: "rejected",
      reason: merged.reason,
      discardedFields: merged.discardedFields,
    };
    await remember(ctx, op, result);
    return result;
  }

  // "Who ticked it" comes from the session, never from the payload — the
  // online endpoints do the same (zadání §10.4).
  const attribution = attributeActor(op.entity, merged.updates, ctx.user.id);

  if (Object.keys(merged.updates).length) {
    await db
      .update(entity.table)
      .set({
        ...merged.updates,
        ...attribution,
        fieldMtimes: merged.fieldMtimes,
        lastModifiedBy: ctx.user.id,
      } as never)
      .where(and(...conditions));

    // Ticking a task off through the outbox must leave the same trace as the
    // online endpoint, otherwise "je čas znovu" would forget it happened.
    if (op.entity === "tasks" && "status" in merged.updates) {
      await recordCompletionHistory(
        { userId: ctx.user.id, householdId: ctx.householdId },
        {
          id: op.entityId,
          templateId: (current.templateId as string | null) ?? null,
          status: current.status as "open" | "done",
        },
        merged.updates.status === "done",
      );
    }
  }

  const result: PushResult = {
    opId: op.opId,
    status: merged.status,
    ...(merged.discardedFields.length
      ? { discardedFields: merged.discardedFields }
      : {}),
  };
  await remember(ctx, op, result);
  return result;
}

async function remember(
  ctx: HouseholdContext,
  op: PushOp,
  result: PushResult,
): Promise<void> {
  await db
    .insert(syncAppliedOps)
    .values({
      opId: op.opId,
      userId: ctx.user.id,
      entity: op.entity,
      entityId: op.entityId,
      result,
    })
    .onConflictDoNothing();
}

/**
 * Attribution of "done" actions. The client may say WHAT changed, never WHO
 * did it — that is the session's job.
 */
function attributeActor(
  entity: string,
  updates: Record<string, unknown>,
  userId: string,
): Record<string, unknown> {
  if (entity === "shopping_items" && "isChecked" in updates) {
    return updates.isChecked
      ? { checkedBy: userId }
      : { checkedBy: null, checkedAt: null };
  }
  if (entity === "tasks" && "status" in updates) {
    return updates.status === "done"
      ? { completedBy: userId }
      : { completedBy: null, completedAt: null };
  }
  return {};
}

/** Timestamp-ish fields arrive as ISO strings over JSON. */
function revive(key: string, value: unknown): unknown {
  if (
    typeof value === "string" &&
    (key.endsWith("At") || key.endsWith("_at")) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  ) {
    return new Date(value);
  }
  return value;
}

/** Current server cursor, so a client can start tailing without a bootstrap. */
export async function currentCursor(ctx: HouseholdContext): Promise<number> {
  const [{ seq }] = await db
    .select({ seq: sql<number>`coalesce(max(seq), 0)::int` })
    .from(changeLog)
    .where(eq(changeLog.householdId, ctx.householdId));
  return seq ?? 0;
}
