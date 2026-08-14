"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeSync, syncNow, type SyncState } from "@/lib/offline/sync";

/**
 * Sync status in the header (docs/SYNC.md §5). Small on purpose: it should be
 * ignorable when everything works and obvious when it does not.
 */
export function SyncIndicator() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeSync(setState);
    void syncNow();

    const online = () => void syncNow();
    const offline = () => void syncNow();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    // Catch anything the events missed (sleep, flaky wifi).
    const timer = setInterval(() => void syncNow(), 5 * 60_000);

    return () => {
      unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      clearInterval(timer);
    };
  }, []);

  if (!state) return null;

  const { icon, label, tone } = describe(state);

  return (
    <Link
      href="/nastaveni/synchronizace"
      title={state.lastError ?? label}
      className={`inline-flex min-h-11 items-center gap-1 px-2 text-sm ${tone}`}
      aria-label={`Synchronizace: ${label}`}
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function describe(state: SyncState): {
  icon: string;
  label: string;
  tone: string;
} {
  if (state.status === "offline") {
    return {
      icon: "⚡",
      label:
        state.pending > 0 ? `offline · ${state.pending} čeká` : "offline",
      tone: "text-muted-foreground",
    };
  }
  if (state.status === "error") {
    return { icon: "⚠️", label: "chyba synchronizace", tone: "text-destructive" };
  }
  if (state.status === "syncing") {
    return { icon: "⟳", label: "synchronizuji…", tone: "text-muted-foreground" };
  }
  if (state.pending > 0) {
    return {
      icon: "⏳",
      label: `${state.pending} čeká`,
      tone: "text-muted-foreground",
    };
  }
  return { icon: "✓", label: "synchronizováno", tone: "text-muted-foreground" };
}
