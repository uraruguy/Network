"use client";
import { Check, Eye, PencilLine } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { cn } from "@/lib/utils";
import type { Access } from "@/lib/mcp/tokens";
import { approveConsent, denyConsent, type ConsentResult } from "./actions";

const OPTIONS: { value: Access; title: string; description: string; icon: ReactNode }[] = [
  { value: "read", title: "Read only", description: "Search people and read notes and follow-ups.", icon: <Eye /> },
  { value: "write", title: "Read & write", description: "Also add notes, people and follow-ups. Nothing can be deleted.", icon: <PencilLine /> },
];

/** Access choice + Allow / Deny. Navigates to the client's redirect URL itself. */
export function ConsentForm({ authorizationId, clientName }: { authorizationId: string; clientName: string }) {
  const [access, setAccess] = useState<Access>("read");
  const [pending, start] = useTransition();
  const [decision, setDecision] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = (kind: "approve" | "deny") => {
    setDecision(kind);
    setError(null);
    start(async () => {
      const result: ConsentResult = kind === "approve" ? await approveConsent(authorizationId, access) : await denyConsent(authorizationId);
      if (result.ok) window.location.assign(result.redirectUrl);
      else {
        setError(result.message);
        setDecision(null);
      }
    });
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 px-1 text-footnote font-medium text-fg-2">What may {clientName} do?</legend>
        <div role="radiogroup" className="surface overflow-hidden rounded-lg">
          {OPTIONS.map((o) => {
            const selected = access === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  "relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors after:absolute after:right-0 after:bottom-0 after:left-14 after:h-[0.5px] after:bg-separator last:after:hidden",
                  selected ? "bg-accent-soft" : "[@media(hover:hover)]:hover:bg-fill-1",
                )}
              >
                <input type="radio" name="access" value={o.value} checked={selected} onChange={() => setAccess(o.value)} className="peer sr-only" />
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-xs bg-fill-2 text-accent-text [&_svg]:size-4" aria-hidden>
                  {o.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-fg">{o.title}</span>
                  <span className="block text-footnote text-fg-3">{o.description}</span>
                </span>
                <span
                  className={cn(
                    "mt-1 grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors peer-focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]",
                    selected ? "border-accent bg-accent-fill text-accent-fg" : "border-hairline-strong",
                  )}
                  aria-hidden
                >
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-subhead text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <GlassButton variant="surface" className="flex-1" disabled={pending} loading={pending && decision === "deny"} onClick={() => decide("deny")}>
          Deny
        </GlassButton>
        <GlassButton variant="primary" className="flex-1" disabled={pending} loading={pending && decision === "approve"} onClick={() => decide("approve")}>
          Allow
        </GlassButton>
      </div>
    </div>
  );
}
