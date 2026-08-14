"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  offlineDb,
  type DiscardedChange,
  type OutboxOp,
} from "@/lib/offline/db";
import { subscribeSync, syncNow, type SyncState } from "@/lib/offline/sync";

const button =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm disabled:opacity-50 min-h-11";

const REASONS: Record<string, string> = {
  row_deleted: "záznam byl mezitím smazaný",
  row_not_found: "záznam na serveru neexistuje",
  entity_not_writable_offline: "tuhle věc zatím nejde měnit offline",
};

/**
 * Sync detail (docs/SYNC.md §4.4, §5): what is waiting, what was discarded and
 * why. Discarded values are kept locally so they can be copied back by hand —
 * nothing disappears without a trace.
 */
export default function SyncSettingsPage() {
  const [state, setState] = useState<SyncState | null>(null);
  const [outbox, setOutbox] = useState<OutboxOp[]>([]);
  const [discarded, setDiscarded] = useState<DiscardedChange[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = offlineDb();
      setOutbox(await db.outbox.toArray());
      setDiscarded((await db.discarded.orderBy("at").reverse().toArray()).slice(0, 50));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSync(setState);
    void load();
    return unsubscribe;
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/nastaveni" className="text-sm text-primary hover:underline">
          ← Nastavení
        </Link>
      </div>
      <h1 className="text-3xl font-semibold">Synchronizace</h1>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="rounded-card border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-2 text-lg font-semibold">Stav</h2>
        {state && (
          <ul className="space-y-1 text-sm">
            <li>
              Stav:{" "}
              <strong>
                {state.status === "idle"
                  ? "synchronizováno"
                  : state.status === "syncing"
                    ? "synchronizuji"
                    : state.status === "offline"
                      ? "offline"
                      : "chyba"}
              </strong>
            </li>
            <li>Čeká na odeslání: {state.pending}</li>
            <li>
              Poslední synchronizace:{" "}
              {state.lastSyncAt
                ? new Date(state.lastSyncAt).toLocaleString("cs-CZ")
                : "—"}
            </li>
            {state.lastError && (
              <li className="text-destructive">Chyba: {state.lastError}</li>
            )}
          </ul>
        )}
        <button
          onClick={async () => {
            await syncNow();
            await load();
          }}
          className={`${button} mt-3`}
        >
          Synchronizovat teď
        </button>
      </section>

      <section className="rounded-card border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-2 text-lg font-semibold">
          Fronta ({outbox.length})
        </h2>
        {outbox.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Všechno je odeslané.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {outbox.map((op) => (
              <li key={op.opId}>
                {op.entity} · {op.op} ·{" "}
                <span className="text-muted-foreground">
                  {new Date(op.clientTs).toLocaleString("cs-CZ")}
                  {op.state === "failed" ? " · nepodařilo se odeslat" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-2 text-lg font-semibold">Zahozené změny</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Změny, které přepsala novější úprava někoho jiného, nebo je server
          odmítl. Drží se posledních 50.
        </p>
        {discarded.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím nic.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {discarded.map((d) => (
              <li key={d.id}>
                {new Date(d.at).toLocaleString("cs-CZ")} · {d.entity} ·{" "}
                {d.fields.join(", ")}
                {d.reason && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({REASONS[d.reason] ?? d.reason})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
