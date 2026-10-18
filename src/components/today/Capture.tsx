"use client";
import Link from "next/link";
import { useMutationState } from "@tanstack/react-query";
import { ArrowRight, Check, CloudOff, Repeat, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Composer } from "@/components/composer/Composer";
import { GlassButton } from "@/components/glass/GlassButton";
import { NAV_FORWARD } from "@/components/shell/transitions";
import { IconButton } from "@/components/ui/IconButton";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { fadeScale } from "@/lib/motion";
import { useCacheReady } from "@/lib/offline/useCacheReady";
import { INBOX_MUT, useCapture, useInbox, useInboxAction, type InboxRow } from "@/lib/queries/inbox";
import { cn } from "@/lib/utils";

/**
 * Quick capture: type who you met like a text message; the AI works out who it's about and
 * proposes people + follow-ups, which land in the inbox below for one-tap approval.
 */
export function Capture() {
  const capture = useCapture();
  const { data: items = [] } = useInbox();
  const pending = useMutationState({
    filters: { mutationKey: INBOX_MUT.capture, status: "pending" },
    select: (m) => ({ id: m.mutationId, text: String(m.state.variables ?? ""), paused: m.state.isPaused }),
  });

  const submit = (text: string) =>
    capture.mutateAsync(text).catch((e: unknown) => {
      // The server saved the text before it failed (it shows up in the inbox): don't offer it again.
      if (e instanceof ApiError) {
        toast.error("Couldn't work that out", { description: e.message });
        return;
      }
      toast.error("Couldn't save that", { description: "Check your connection — your text is back in the field." });
      throw e;
    });

  // Inbox items come from the restored cache: never during hydration (see useCacheReady).
  const ready = useCacheReady();
  const count = ready ? items.length + pending.length : 0;

  return (
    <section aria-label="Quick capture">
      <Composer
        leading={<Sparkles size={18} strokeWidth={2.2} />}
        placeholder="Who did you meet? Jot it down…"
        label="Quick capture"
        sendLabel="Capture"
        hint="⌘↩ to capture · the AI files it for you"
        onSubmit={submit}
      />

      {count > 0 && (
        <div className="mt-4 space-y-2.5">
          <h2 className="flex items-baseline gap-2 px-1 text-headline text-fg">
            Inbox <span className="text-subhead font-medium text-fg-3 tabular-nums">{count}</span>
          </h2>
          <AnimatePresence initial={false} mode="popLayout">
            {pending.map((p) => (
              <motion.div key={`pending-${p.id}`} layout variants={fadeScale} initial="initial" animate="animate" exit="exit">
                <PendingCard text={p.text} paused={p.paused} />
              </motion.div>
            ))}
            {items.map((it) => (
              <motion.div key={it.id} layout variants={fadeScale} initial="initial" animate="animate" exit="exit">
                <InboxCard item={it} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function PendingCard({ text, paused }: { text: string; paused: boolean }) {
  return (
    <div className="surface rounded-lg p-4" aria-busy>
      <p className="line-clamp-4 text-subhead whitespace-pre-wrap text-fg">{text}</p>
      <p className="mt-2 flex items-center gap-2 text-footnote text-fg-3">
        {paused ? (
          <>
            <CloudOff size={14} aria-hidden /> Waiting for a connection
          </>
        ) : (
          <>
            <Spinner size={14} /> Working out who this is about…
          </>
        )}
      </p>
    </div>
  );
}

function InboxCard({ item: it }: { item: InboxRow }) {
  const act = useInboxAction();
  const busy = act.isPending;
  const candidates = it.proposal?.candidates ?? [];
  const dismiss = () => act.mutate({ id: it.id, action: "dismiss" });

  return (
    <article className="surface rounded-lg p-4">
      <div className="flex items-start gap-2">
        <p className="line-clamp-4 min-w-0 flex-1 text-subhead whitespace-pre-wrap text-fg">{it.text}</p>
        <IconButton variant="plain" size="sm" label="Dismiss" icon={<X strokeWidth={2.4} />} onClick={dismiss} disabled={busy} className="-mt-1 -mr-1" />
      </div>
      <p className="mt-1 text-caption text-fg-3">
        {it.source === "app" ? "Captured" : `From ${it.source}`} · <RelativeTime date={it.createdAt} />
      </p>

      {it.status === "new" && (
        <GlassButton size="sm" variant="soft" className="mt-3" loading={busy && act.variables?.action === "triage"} onClick={() => act.mutate({ id: it.id, action: "triage" })} disabled={busy}>
          <Sparkles size={14} aria-hidden /> Work it out
        </GlassButton>
      )}

      {it.proposal && (
        <div className="mt-3 rounded-md bg-accent-soft p-3">
          {candidates.length === 0 ? (
            <p className="text-footnote text-fg-2">No person found in this. Dismiss it or add someone by hand.</p>
          ) : (
            <ul className="space-y-2.5">
              {candidates.map((c, i) => (
                <li key={i} className={cn("text-footnote", i > 0 && "border-t-[0.5px] border-separator pt-2.5")}>
                  <p className="text-subhead text-fg">
                    <span className="font-semibold">{c.name}</span>
                    {c.matchName ? (
                      <span className="text-fg-2"> → {c.matchName}</span>
                    ) : (
                      <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-accent-fill px-2 align-[1px] text-caption2 font-semibold text-accent-fg">New</span>
                    )}
                  </p>
                  {(c.role || c.company || c.city) && <p className="text-fg-2">{[[c.role, c.company].filter(Boolean).join(", "), c.city].filter(Boolean).join(" · ")}</p>}
                  {c.followUps.length > 0 && (
                    <p className="mt-0.5 flex items-start gap-1.5 text-fg-2">
                      <Repeat size={12} className="mt-[3px] shrink-0" aria-hidden />
                      <span>{c.followUps.map((f) => `${f.what}${f.when ? ` (${f.when})` : ""}`).join(" · ")}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {candidates.length > 0 && (
            <div className="mt-3 flex justify-end gap-2">
              <GlassButton size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
                Dismiss
              </GlassButton>
              <GlassButton size="sm" variant="primary" loading={busy && act.variables?.action === "apply"} onClick={() => act.mutate({ id: it.id, action: "apply" })} disabled={busy}>
                <Check size={14} strokeWidth={2.6} aria-hidden /> Add to network
              </GlassButton>
            </div>
          )}
        </div>
      )}

      {it.status === "applied" && it.appliedPersonId && (
        <Link href={`/people/${it.appliedPersonId}`} transitionTypes={NAV_FORWARD} className="mt-2 inline-flex items-center gap-1 text-footnote font-medium text-accent-text">
          Open person <ArrowRight size={13} aria-hidden />
        </Link>
      )}
    </article>
  );
}
