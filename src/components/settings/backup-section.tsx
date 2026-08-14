"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Run = {
  id: string;
  kind: "auto" | "manual";
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "ok" | "failed";
  sizeBytes: number | null;
  detail: string | null;
};
type Status = {
  runs: Run[];
  lastOk: Run | null;
  isStale: boolean;
  pendingTrigger: boolean;
  sidecarSeen: boolean;
  sizeBytes: number | null;
};

const button =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm disabled:opacity-50 min-h-11";

export function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BackupSection({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<Status>("/api/backups/status"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runBackup() {
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/backups/run", { method: "POST" });
      // The sidecar polls once a minute; show the queued state immediately
      // and refresh a few times so the finished run appears on its own.
      await load();
      for (const delay of [5000, 15000, 30000, 60000]) {
        setTimeout(() => void load(), delay);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-2 text-lg font-semibold">Zálohy</h2>

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {status && (
        <>
          {!status.sidecarSeen ? (
            <p className="mb-3 rounded-lg bg-surface-warm p-3 text-sm">
              ⚠️ Zatím neproběhla žádná záloha. Běží kontejner{" "}
              <code>backup</code> (<code>docker compose up -d backup</code>)?
            </p>
          ) : status.isStale ? (
            <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              ⚠️ Poslední úspěšná záloha je starší než 48 hodin
              {status.lastOk
                ? ` (${formatDateTime(status.lastOk.finishedAt)})`
                : ""}
              .
            </p>
          ) : (
            <p className="mb-3 text-sm">
              ✅ Poslední úspěšná záloha:{" "}
              <strong>{formatDateTime(status.lastOk?.finishedAt ?? null)}</strong>{" "}
              ({formatBytes(status.lastOk?.sizeBytes ?? null)})
            </p>
          )}

          {status.pendingTrigger && (
            <p className="mb-3 rounded-lg bg-surface-warm p-3 text-sm">
              ⏳ Ruční záloha je zařazená, čeká na zálohovací službu (kontroluje
              se jednou za minutu).
            </p>
          )}

          <p className="mb-3 text-sm text-muted-foreground">
            Zálohy celkem: {formatBytes(status.sizeBytes)} · denně ve 3:00,
            drží se 7 denních, 4 týdenní a 12 měsíčních.
          </p>

          {status.runs.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {status.runs.slice(0, 5).map((r) => (
                <li key={r.id} className="flex flex-wrap gap-2">
                  <span>
                    {r.status === "ok"
                      ? "✅"
                      : r.status === "failed"
                        ? "❌"
                        : "⏳"}
                  </span>
                  <span>{formatDateTime(r.startedAt)}</span>
                  <span className="text-muted-foreground">
                    {r.kind === "auto" ? "automatická" : "ruční"}
                    {r.sizeBytes ? ` · ${formatBytes(r.sizeBytes)}` : ""}
                  </span>
                  {r.status === "failed" && r.detail && (
                    <span className="text-destructive">{r.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <button onClick={runBackup} disabled={pending} className={button}>
            Zálohovat teď
          </button>
        )}
        <button onClick={() => void load()} className={button}>
          Obnovit stav
        </button>
      </div>
    </section>
  );
}
