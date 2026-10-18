"use client";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { buttonVariants, GlassButton } from "@/components/glass/GlassButton";
import { StatusCard, StatusScreen } from "@/components/shell/StatusCard";
import { TAB } from "@/components/shell/transitions";

/**
 * Error boundary for every (app) screen. Renders inside the shell (sidebar / tab bar stay), so
 * the rest of the app remains one tap away. `retry()` re-fetches and re-renders the segment.
 */
export default function AppError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const dev = process.env.NODE_ENV === "development";

  return (
    <StatusScreen>
      <StatusCard
        tone="danger"
        icon={<TriangleAlert strokeWidth={2.1} />}
        title="Something went wrong"
        actions={
          <>
            <Link href="/today" transitionTypes={TAB} className={buttonVariants({ variant: "surface" })}>
              Go to Today
            </Link>
            <GlassButton variant="primary" onClick={() => (retry ?? reset)()}>
              <RotateCw size={17} strokeWidth={2.3} aria-hidden /> Try again
            </GlassButton>
          </>
        }
      >
        <p>This screen hit a snag. Everything you&apos;ve saved is safe — including changes made offline.</p>
        {dev && error.message && <p className="mt-3 rounded-sm bg-fill-1 px-3 py-2 text-left font-mono text-caption break-words text-fg-2">{error.message}</p>}
        {error.digest && <p className="mt-3 text-caption text-fg-3">Reference {error.digest}</p>}
      </StatusCard>
    </StatusScreen>
  );
}
