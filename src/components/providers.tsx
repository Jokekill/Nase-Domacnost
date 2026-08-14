"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribeSync } from "@/lib/offline/sync";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // `networkMode: "offlineFirst"` is what makes the offline fallbacks
          // reachable at all: with the default ("online") TanStack Query
          // PAUSES every query and mutation as soon as navigator.onLine is
          // false, so queryFn — and with it the mirror fallback and the
          // outbox — would never run on a device that really lost signal.
          queries: { staleTime: 30_000, retry: 1, networkMode: "offlineFirst" },
          mutations: { networkMode: "offlineFirst" },
        },
      }),
  );

  // A finished sync means the server may now hold both my queued changes and
  // someone else's — refetch so screens stop showing the pre-sync state
  // (docs/SYNC.md §5).
  useEffect(() => {
    let wasSyncing = false;
    return subscribeSync((state) => {
      if (wasSyncing && state.status === "idle") {
        void client.invalidateQueries();
      }
      wasSyncing = state.status === "syncing";
    });
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
