/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    /**
     * Recipe photos: cache-first with an LRU cap, so the last ~50 recipes
     * a person looked at stay readable in the shop or the cellar
     * (docs/SYNC.md §5).
     */
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith("/api/files/") && request.method === "GET",
      handler: new CacheFirst({
        cacheName: "recipe-photos",
        plugins: [
          new ExpirationPlugin({
            // 4 variants per photo, ~50 recipes with a few photos each.
            maxEntries: 300,
            maxAgeSeconds: 60 * 60 * 24 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    /**
     * Everything else under /api is state: never serve it from a cache, or the
     * app would show stale data and pretend it is fresh. Offline reads come
     * from the Dexie mirror instead.
     */
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
