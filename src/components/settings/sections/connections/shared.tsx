"use client";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { cn } from "@/lib/utils";
import { connectionTone, StatusPill } from "../../parts/StatusPill";

export type ConnStatus = "verified" | "error" | "untested" | "off";
export type ConnCheck = { at: string; ok: boolean; latencyMs?: number; model?: string; error?: string } | null;

/** A connection card: title row with status, body, and a footer bar for test + save. */
export function ConnectionCard({ id, title, icon, status, busy, children, footer }: { id: string; title: string; icon: ReactNode; status: ReactNode; busy?: boolean; children: ReactNode; footer: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} aria-busy={busy || undefined} className="scroll-mt-24 space-y-1.5">
      <div className="flex items-center justify-between gap-3 px-4">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-footnote font-medium tracking-[0.02em] text-fg-3 uppercase [&_svg]:size-4">
          {icon}
          {title}
        </h2>
        {status}
      </div>
      <div className="surface overflow-hidden rounded-lg">
        <div className="@container space-y-5 p-4">{children}</div>
        <div className="flex flex-wrap items-center gap-3 border-t-[0.5px] border-separator bg-fill-1 px-4 py-3">{footer}</div>
      </div>
    </section>
  );
}

/** "Managed by environment" notice listing the variables (names only). */
export function EnvBanner({ vars, what }: { vars: string[]; what: string }) {
  return (
    <div className="flex gap-3 rounded-sm bg-accent-soft p-3 text-subhead text-fg-2">
      <Lock size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
      <p className="min-w-0">
        <span className="font-semibold text-fg">Managed by environment.</span> {what} comes from{" "}
        {vars.map((v, i) => (
          <span key={v}>
            <code className="rounded-xs bg-fill-2 px-1.5 py-px font-mono text-footnote">{v}</code>
            {i < vars.length - 1 ? ", " : ""}
          </span>
        ))}
        . Remove {vars.length > 1 ? "them" : "it"} from your deployment to configure it here instead.
      </p>
    </div>
  );
}

/** Status pill for the card header. */
export function ConnectionStatusPill({ status, testing, check }: { status: ConnStatus; testing?: boolean; check: ConnCheck }) {
  if (testing) return <StatusPill tone="busy">Testing…</StatusPill>;
  const label = status === "verified" ? (check?.latencyMs ? `Connected · ${check.latencyMs} ms` : "Connected") : status === "error" ? "Failed" : status === "untested" ? "Not tested" : "Off";
  return <StatusPill tone={connectionTone(status)}>{label}</StatusPill>;
}

/** Footer: last test result on the left, actions on the right. */
export function TestFooter({ status, check, detail, children }: { status: ConnStatus; check: ConnCheck; detail?: ReactNode; children: ReactNode }) {
  return (
    <>
      <p className={cn("min-w-0 flex-1 basis-56 text-footnote", status === "error" ? "text-danger" : "text-fg-3")} aria-live="polite">
        {status === "verified" && check ? (
          <>
            Tested <RelativeTime date={check.at} />
            {detail ? <> · {detail}</> : null}
          </>
        ) : status === "error" && check ? (
          <>{check.error ?? "The last test failed."}</>
        ) : status === "untested" ? (
          "Not tested yet — run a test to make sure it works."
        ) : (
          "Turned off."
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </>
  );
}

/** Appears only once something changed (then the test button steps aside until it's saved). */
export function SaveButton({ dirty, loading, onClick, label = "Save" }: { dirty: boolean; loading: boolean; onClick: () => void; label?: string }) {
  if (!dirty && !loading) return null;
  return (
    <GlassButton size="sm" variant="primary" loading={loading} onClick={onClick}>
      {label}
    </GlassButton>
  );
}

/** "Get a key" style helper link. */
export function HelpLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-text underline-offset-2 hover:underline">
      {children}
    </a>
  );
}
