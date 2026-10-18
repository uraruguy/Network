"use client";
import Link from "next/link";
import { ChevronRight, CircleAlert, CircleCheck, CircleDashed, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { SetupItem, SetupState } from "@/lib/connections/setup-status";
import { useReadyData } from "@/lib/offline/useCacheReady";
import { useSetupStatus } from "@/lib/queries/settings";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CodeSnippet } from "../parts/CodeSnippet";
import { SectionPage } from "../SettingsShell";

const STATE_ICON: Record<SetupState, ReactNode> = {
  ok: <CircleCheck className="text-success" />,
  todo: <CircleDashed className="text-fg-4" />,
  warn: <TriangleAlert className="text-warning" />,
  error: <CircleAlert className="text-danger" />,
};
const STATE_LABEL: Record<SetupState, string> = { ok: "Done", todo: "To do", warn: "Check", error: "Problem" };

function Ring({ done, total }: { done: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${done} of ${total} done`} className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-fill-3" />
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className="stroke-accent transition-[stroke-dasharray] duration-500" />
    </svg>
  );
}

/** The install checklist (also the desktop landing pane of Settings). */
export function SetupChecklist({ compact }: { compact?: boolean }) {
  const status = useSetupStatus();
  const { isFetching, refetch } = status;
  const data = useReadyData(status);
  if (!data) {
    return (
      <div className="surface overflow-hidden rounded-lg">
        <SkeletonRows count={compact ? 3 : 6} avatar={false} />
      </div>
    );
  }
  const required = data.items.filter((i) => !i.optional);
  const optional = data.items.filter((i) => i.optional);
  return (
    <div className="space-y-6">
      <div className="surface flex items-center gap-4 rounded-lg p-4">
        <Ring done={data.done} total={data.total} />
        <div className="min-w-0 flex-1">
          <p className="text-headline">{data.complete ? "Everything is set up" : `${data.total - data.done} thing${data.total - data.done === 1 ? "" : "s"} left`}</p>
          <p className="text-footnote text-fg-3">
            {data.done} of {data.total} done · checked <RelativeTime date={data.checkedAt} format={(d, now) => formatRelative(new Date(Math.min(d.getTime(), now)), now)} />
          </p>
        </div>
        <IconButton label="Check again" icon={<RefreshCw className={cn(isFetching && "animate-spin")} />} onClick={() => refetch()} disabled={isFetching} />
      </div>
      <ItemGroup items={required} />
      {optional.length > 0 && <ItemGroup header="Optional" items={optional} />}
    </div>
  );
}

function ItemGroup({ header, items }: { header?: string; items: SetupItem[] }) {
  return (
    <section className="space-y-1.5">
      {header && <h3 className="px-4 text-footnote font-medium tracking-[0.02em] text-fg-3 uppercase">{header}</h3>}
      <ul className="surface overflow-hidden rounded-lg">
        {items.map((item) => (
          <SetupRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function SetupRow({ item }: { item: SetupItem }) {
  const showCmd = !!item.command && item.state !== "ok";
  const body = (
    <>
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center [&_svg]:size-[22px]" role="img" aria-label={STATE_LABEL[item.state]}>
        {STATE_ICON[item.state]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-fg">{item.label}</span>
        <span className="mt-0.5 block text-footnote text-fg-3">{item.detail}</span>
      </span>
      {item.href && <ChevronRight size={18} strokeWidth={2.4} className="mt-1 -mr-1 shrink-0 text-fg-4" aria-hidden />}
    </>
  );
  const rowClass =
    "relative flex w-full items-start gap-3 px-4 py-3 text-left after:absolute after:right-0 after:bottom-0 after:left-[52px] after:h-[0.5px] after:bg-separator";
  return (
    <li className="[&:last-child>*]:after:hidden">
      {item.href ? (
        <Link href={item.href} className={cn(rowClass, "transition-colors active:bg-fill-2 [@media(hover:hover)]:hover:bg-fill-1", showCmd && "after:hidden")}>
          {body}
        </Link>
      ) : (
        <div className={cn(rowClass, showCmd && "after:hidden")}>{body}</div>
      )}
      {showCmd && (
        <div className="relative px-4 pb-3 pl-[52px] after:absolute after:right-0 after:bottom-0 after:left-[52px] after:h-[0.5px] after:bg-separator">
          <CodeSnippet code={item.command!} />
        </div>
      )}
    </li>
  );
}

export function SetupSection() {
  return (
    <SectionPage id="setup" description="What this install needs to work fully. Green means done; everything else has a fix.">
      <SetupChecklist />
    </SectionPage>
  );
}
