import { SerwistProvider } from "@serwist/next/react";
import { AppShell } from "@/components/shell/AppShell";
import { DevServiceWorkerCleanup } from "@/components/shell/DevServiceWorkerCleanup";
import { serviceWorkerEnabled } from "@/lib/offline/sw-dev";

/**
 * No auth check here on purpose: the proxy gates every page request and the API re-verifies every
 * call, so the shell stays static and prefetchable (and opens instantly offline).
 *
 * The service worker registers here and not in the root layout: these pages are only served with a
 * full session, so the install's precache fetches get the real pages. On the sign-in pages every
 * app page would redirect to /login, and the precache guard (lib/offline/precache.ts) would fail
 * the install after downloading the whole manifest. Sign-in ends in a full navigation to an app
 * page, which registers. In `next dev` it stays off unless NEXT_PUBLIC_SW_DEV=1 (lib/offline/sw-dev.ts).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const swOn = serviceWorkerEnabled();
  return (
    // No reload on `online`: it would close open sheets and editors. Queries and queued writes
    // resume by themselves; only /~offline reloads (lib/offline/reconnect.ts).
    <SerwistProvider swUrl="/sw.js" reloadOnOnline={false} disable={!swOn}>
      {!swOn && <DevServiceWorkerCleanup />}
      <AppShell>{children}</AppShell>
    </SerwistProvider>
  );
}
