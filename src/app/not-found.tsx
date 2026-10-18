import { LinkButton } from "@/components/shell/LinkButton";
import { Logo } from "@/components/shell/Logo";
import { StatusCard } from "@/components/shell/StatusCard";

export const metadata = { title: "Not found" };

/** Unmatched URLs (outside the app shell). */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 pt-[max(24px,var(--sat))] pb-[max(24px,var(--sab))]">
      <div className="app-bg" aria-hidden />
      <StatusCard
        icon={<Logo size={56} />}
        tone="plain"
        title="This page doesn't exist"
        actions={
          <LinkButton href="/today" variant="primary">
            Go to Today
          </LinkButton>
        }
      >
        The link may be old, or the address mistyped.
      </StatusCard>
    </main>
  );
}
