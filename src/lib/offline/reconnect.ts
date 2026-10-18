type ReconnectWindow = Pick<Window, "addEventListener" | "removeEventListener" | "navigator" | "document" | "location">;

/**
 * The app reconnects without a reload (TanStack's onlineManager resumes queued writes and
 * refetches; notes reconcile), so `SerwistProvider` runs with `reloadOnOnline` off. The one page
 * that needs a reload is the service worker's offline fallback: it stands in for a document that
 * never loaded, and reloading retries that URL. Retry once the network is back — on `online`, and
 * when the app comes to the foreground already online (a suspended iPhone PWA can miss the
 * event, and a timed-out load leaves the fallback up while `navigator.onLine` is true).
 * Returns the cleanup.
 */
export function reloadWhenOnline(win: ReconnectWindow, reload = () => win.location.reload()): () => void {
  let reloading = false;
  const retry = () => {
    if (reloading || !win.navigator.onLine) return;
    reloading = true;
    reload();
  };
  const onVisibility = () => win.document.visibilityState === "visible" && retry();
  win.addEventListener("online", retry);
  win.document.addEventListener("visibilitychange", onVisibility);
  return () => {
    win.removeEventListener("online", retry);
    win.document.removeEventListener("visibilitychange", onVisibility);
  };
}
