import { CloudOff } from "lucide-react";
import { LinkButton } from "@/components/shell/LinkButton";
import { StatusCard } from "@/components/shell/StatusCard";
import { RetryButton } from "./RetryButton";

export const metadata = { title: "Offline" };

/**
 * Service-worker fallback for documents that aren't cached yet. Every screen you've opened
 * before keeps working offline (cached shell + IndexedDB data), so the way out is a plain link.
 */
export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 pt-[max(24px,var(--sat))] pb-[max(24px,var(--sab))]">
      <div className="app-bg" aria-hidden />
      <StatusCard
        tone="neutral"
        icon={<CloudOff strokeWidth={2} />}
        title="You're offline"
        actions={
          <>
            {/* Full navigation on purpose: the service worker serves the cached app for it. */}
            <LinkButton href="/today" hard>
              Open Today
            </LinkButton>
            <RetryButton />
          </>
        }
      >
        This page hasn&apos;t been saved for offline use yet. Everything you&apos;ve opened before still works, and changes sync when you&apos;re back online.
      </StatusCard>
    </main>
  );
}
