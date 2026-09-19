"use client";
import Link from "next/link";
import { ArrowUp, Check, Inbox, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { useCapture, useInbox, useInboxAction } from "@/lib/queries/inbox";
import { cn, formatRelative } from "@/lib/utils";

export function Capture() {
  const [text, setText] = useState("");
  const capture = useCapture();
  const { data: items = [] } = useInbox();
  const act = useInboxAction();

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    capture.mutate(t, { onSuccess: () => setText("") });
  };

  return (
    <section className="mt-5">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="glass-strong specular flex items-end gap-2 rounded-[26px] p-1.5 pl-4"
      >
        <Sparkles size={18} className="mb-3 shrink-0 text-accent-strong" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Who did you meet? Type it like a text message…"
          rows={1}
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[15.5px] outline-none placeholder:text-fg-4"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button type="submit" disabled={!text.trim() || capture.isPending} className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-40" aria-label="Capture">
          {capture.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowUp size={18} strokeWidth={2.6} />}
        </button>
      </form>
      {capture.error && <p className="mt-2 px-2 text-[13px] text-danger">{capture.error.message}</p>}

      {items.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-fg-3"><Inbox size={13} /> Inbox · {items.length}</h2>
          <div className="space-y-2">
            {items.map((it) => (
              <GlassCard key={it.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{it.text}</p>
                  <button onClick={() => act.mutate({ id: it.id, action: "dismiss" })} aria-label="Dismiss" className="pressable grid h-7 w-7 shrink-0 place-items-center rounded-full text-fg-4 hover:bg-fg/6"><X size={14} /></button>
                </div>
                <p className="mt-1 text-[12px] text-fg-3">{it.source} · {formatRelative(it.createdAt)}</p>
                {it.status === "new" && (
                  <GlassButton size="sm" variant="soft" className="mt-3" onClick={() => act.mutate({ id: it.id, action: "triage" })} disabled={act.isPending}><Sparkles size={13} /> Work it out</GlassButton>
                )}
                {it.proposal && (
                  <div className="mt-3 space-y-2 rounded-[14px] bg-accent-soft/50 p-3">
                    {it.proposal.candidates.length === 0 && <p className="text-[13.5px] text-fg-2">No person found in this. Dismiss or add manually.</p>}
                    {it.proposal.candidates.map((c, i) => (
                      <div key={i} className={cn("text-[13.5px]", i > 0 && "border-t border-[var(--glass-border-2)] pt-2")}>
                        <p>
                          <span className="font-semibold">{c.name}</span>
                          {c.matchName ? <span className="text-fg-2"> → merge into {c.matchName}</span> : <span className="text-accent-strong"> · new person</span>}
                          {(c.role || c.company) && <span className="text-fg-2"> · {[c.role, c.company].filter(Boolean).join(", ")}</span>}
                          {c.city && <span className="text-fg-2"> · {c.city}</span>}
                        </p>
                        {c.followUps.length > 0 && <p className="text-[12.5px] text-fg-2">↻ {c.followUps.map((f) => `${f.what}${f.when ? ` (${f.when})` : ""}`).join(" · ")}</p>}
                      </div>
                    ))}
                    {it.proposal.candidates.length > 0 && (
                      <div className="flex justify-end gap-2 pt-1">
                        <GlassButton size="sm" variant="ghost" onClick={() => act.mutate({ id: it.id, action: "dismiss" })}>Dismiss</GlassButton>
                        <GlassButton size="sm" variant="primary" onClick={() => act.mutate({ id: it.id, action: "apply" })} disabled={act.isPending}><Check size={14} strokeWidth={2.5} /> Add to network</GlassButton>
                      </div>
                    )}
                  </div>
                )}
                {it.status === "applied" && it.appliedPersonId && <Link href={`/people/${it.appliedPersonId}`} className="mt-2 block text-[13px] text-accent-strong">Open person →</Link>}
              </GlassCard>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
