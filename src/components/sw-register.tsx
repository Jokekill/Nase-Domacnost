"use client";

import { useEffect } from "react";

/**
 * Registers the service worker built by @serwist/next (§10.2).
 *
 * Explicit rather than magic: in development no sw.js is produced, so the
 * registration simply fails and is ignored — that is the intended behaviour,
 * not an error worth showing anyone.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Secure context only (https or localhost) — same requirement as the
    // barcode scanner, and what `tailscale serve` gives us on the Pi.
    if (!window.isSecureContext) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* no service worker in this build */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
