"use client";

import {
  getMeta,
  offlineDb,
  setMeta,
  type MirrorTable,
  type OutboxOp,
  MIRROR_TABLES,
} from "./db";

const CURSOR_KEY = "syncCursor";
const LAST_SYNC_KEY = "lastSyncAt";
const BATCH = 50;

export type SyncState = {
  status: "idle" | "syncing" | "offline" | "error";
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

type Listener = (state: SyncState) => void;

let state: SyncState = {
  status: "idle",
  pending: 0,
  lastSyncAt: null,
  lastError: null,
};
const listeners = new Set<Listener>();

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function update(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function getSyncState(): SyncState {
  return state;
}

async function refreshPending() {
  const pending = await offlineDb().outbox.count();
  update({ pending });
}

/* ------------------------------------------------------------------ */
/* Pull                                                               */
/* ------------------------------------------------------------------ */

/**
 * Brings the mirror up to date (docs/SYNC.md §2). A cursor that fell out of
 * the retention window answers 409 → we start over with a bootstrap, which is
 * exactly what the protocol prescribes.
 */
export async function pull(): Promise<void> {
  const db = offlineDb();
  const cursor = await getMeta<number>(CURSOR_KEY, 0);

  if (cursor === 0) {
    const res = await fetch("/api/sync/pull?bootstrap=true");
    if (!res.ok) throw new Error(await errorMessage(res));
    const data = (await res.json()) as {
      tables: Record<string, Record<string, unknown>[]>;
      cursor: number;
    };
    await db.transaction("rw", MIRROR_TABLES.map((t) => db.table(t)), async () => {
      for (const table of MIRROR_TABLES) {
        const rows = data.tables[table] ?? [];
        await db.mirror(table).clear();
        if (rows.length) await db.mirror(table).bulkPut(rows as never);
      }
    });
    await setMeta(CURSOR_KEY, data.cursor);
    return;
  }

  let current = cursor;
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`/api/sync/pull?cursor=${current}`);
    if (res.status === 409) {
      // Cursor expired — full re-bootstrap.
      await setMeta(CURSOR_KEY, 0);
      return pull();
    }
    if (!res.ok) throw new Error(await errorMessage(res));
    const data = (await res.json()) as {
      changes: { table: string; op: string; row: Record<string, unknown> }[];
      nextCursor: number;
      hasMore: boolean;
    };

    for (const change of data.changes) {
      if (!MIRROR_TABLES.includes(change.table as MirrorTable)) continue;
      const table = db.mirror(change.table as MirrorTable);
      // Soft deletes stay in the mirror with deleted_at set: screens filter
      // them out, and sync needs to know the row existed.
      await table.put(change.row as never);
    }

    current = data.nextCursor;
    await setMeta(CURSOR_KEY, current);
    if (!data.hasMore) break;
  }
}

/* ------------------------------------------------------------------ */
/* Outbox                                                             */
/* ------------------------------------------------------------------ */

/**
 * Records a local mutation and applies it to the mirror right away, so the UI
 * reflects it whether or not the network is there (docs/SYNC.md §5).
 */
export async function enqueue(
  entity: MirrorTable,
  entityId: string,
  payload: Record<string, unknown>,
  op: OutboxOp["op"] = "update",
): Promise<void> {
  const db = offlineDb();
  const clientTs = new Date().toISOString();

  await db.outbox.put({
    opId: crypto.randomUUID(),
    entity,
    entityId,
    op,
    payload,
    clientTs,
    state: "pending",
  });

  const existing = await db.mirror(entity).get(entityId);
  if (existing) {
    await db.mirror(entity).put({ ...existing, ...payload } as never);
  }
  await refreshPending();
  void flush();
}

/** Sends the outbox in FIFO batches; every op is idempotent by opId. */
export async function flush(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    update({ status: "offline" });
    return;
  }
  const db = offlineDb();
  const pending = await db.outbox
    .where("state")
    .anyOf("pending", "failed")
    .sortBy("clientTs");
  if (!pending.length) {
    update({ status: "idle", lastError: null });
    return;
  }

  update({ status: "syncing" });
  try {
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // `state` and `error` are local bookkeeping; the server never sees them.
          ops: batch.map((op) => ({
            opId: op.opId,
            entity: op.entity,
            entityId: op.entityId,
            op: op.op,
            payload: op.payload,
            clientTs: op.clientTs,
          })),
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const data = (await res.json()) as {
        results: {
          opId: string;
          status: string;
          discardedFields?: string[];
          reason?: string;
        }[];
      };

      for (const result of data.results) {
        const op = batch.find((b) => b.opId === result.opId);
        // Nothing is dropped silently (docs/SYNC.md §4.4).
        if (result.discardedFields?.length || result.status === "rejected") {
          await db.discarded.add({
            at: new Date().toISOString(),
            entity: op?.entity ?? "?",
            entityId: op?.entityId ?? "?",
            fields: result.discardedFields ?? Object.keys(op?.payload ?? {}),
            reason: result.reason,
          });
          const total = await db.discarded.count();
          if (total > 50) {
            const oldest = await db.discarded.orderBy("at").limit(total - 50).toArray();
            await db.discarded.bulkDelete(oldest.map((d) => d.id!));
          }
        }
        // Applied, already applied, merged or rejected — either way the server
        // has spoken and the op must not be retried.
        await db.outbox.delete(result.opId);
      }
    }

    await pull();
    await setMeta(LAST_SYNC_KEY, new Date().toISOString());
    update({
      status: "idle",
      lastError: null,
      lastSyncAt: await getMeta<string | null>(LAST_SYNC_KEY, null),
    });
  } catch (err) {
    update({
      status: navigator.onLine ? "error" : "offline",
      lastError: (err as Error).message,
    });
  } finally {
    await refreshPending();
  }
}

/** Pull + flush, used on start-up and when the connection comes back. */
export async function syncNow(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    update({ status: "offline" });
    return;
  }
  update({ status: "syncing" });
  try {
    await flush();
    await pull();
    await setMeta(LAST_SYNC_KEY, new Date().toISOString());
    update({
      status: "idle",
      lastError: null,
      lastSyncAt: await getMeta<string | null>(LAST_SYNC_KEY, null),
    });
  } catch (err) {
    update({
      status: navigator.onLine ? "error" : "offline",
      lastError: (err as Error).message,
    });
  } finally {
    await refreshPending();
  }
}

async function errorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return (
    (data as { error?: { message?: string } } | null)?.error?.message ??
    `Server odpověděl ${res.status}.`
  );
}
