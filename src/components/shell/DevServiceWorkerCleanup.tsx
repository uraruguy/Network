"use client";
import { useEffect } from "react";

/**
 * Dev only (rendered when the service worker is off, see lib/offline/sw-dev.ts): removes a worker
 * and its caches left behind by an earlier `pnpm dev:sw` or production build on this origin, which
 * would otherwise keep controlling localhost and reload the page on every Fast Refresh.
 */
export function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void (async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (!regs.length) return;
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      console.info(`[dev] removed ${regs.length} service worker registration(s); set NEXT_PUBLIC_SW_DEV=1 (pnpm dev:sw) to test it`);
    })();
  }, []);
  return null;
}
