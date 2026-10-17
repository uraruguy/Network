"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, X } from "lucide-react";
import { Avatar } from "@/components/glass/Avatar";
import { buttonVariants } from "@/components/glass/GlassButton";
import { CircleBadge } from "@/components/people/CirclePicker";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { spring } from "@/lib/motion";
import type { GraphLink, GraphNode } from "@/lib/queries/types";
import { cn, flag } from "@/lib/utils";
import { linkLabel } from "./graph-data";

type Props = {
  node: GraphNode | null;
  nodes: GraphNode[];
  links: GraphLink[];
  phone: boolean;
  /** Desktop: distance from the top (below the header). */
  top: number;
  onSelect: (id: string | null) => void;
};

/** Selected person on the graph: sheet on phones, floating side panel on larger screens. */
export function GraphPersonPanel({ node, nodes, links, phone, top, onSelect }: Props) {
  const close = () => onSelect(null);
  if (phone) {
    return (
      <Sheet open={!!node} onOpenChange={(o) => !o && close()} snapPoints={[0.35, 0.9]} title={node?.name} footer={node && <OpenProfile id={node.id} />}>
        {node && <Details node={node} nodes={nodes} links={links} onSelect={onSelect} />}
      </Sheet>
    );
  }
  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          key="graph-panel"
          aria-label={node.name}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={spring.smooth}
          style={{ top }}
          className="pointer-events-auto absolute right-3 bottom-[calc(var(--chrome-bottom)+12px)] z-20 flex w-[360px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-xl glass-map specular lg:right-6 lg:bottom-6"
        >
          <div className="flex justify-end px-3 pt-3">
            <IconButton label="Close" icon={<X strokeWidth={2.4} />} size="sm" onClick={close} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
            <Details node={node} nodes={nodes} links={links} onSelect={onSelect} />
          </div>
          <div className="border-t-[0.5px] border-separator px-4 py-3">
            <OpenProfile id={node.id} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function OpenProfile({ id }: { id: string }) {
  return (
    <Link href={`/people/${id}`} className={cn(buttonVariants({ variant: "soft", size: "md" }), "w-full")}>
      Open profile
    </Link>
  );
}

function Details({ node, nodes, links, onSelect }: { node: GraphNode; nodes: GraphNode[]; links: GraphLink[]; onSelect: (id: string | null) => void }) {
  const names = new Map(nodes.map((n) => [n.id, n.name]));
  const nameOf = (id: string) => (id === "me" ? "you" : (names.get(id) ?? "someone"));
  const own = links.filter((l) => l.source === node.id || l.target === node.id);
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={node.name} src={node.avatarUrl} size={52} />
        <div className="min-w-0 flex-1">
          <Link href={`/people/${node.id}`} className="block truncate text-headline text-fg hover:underline">
            {node.name}
          </Link>
          <p className="truncate text-footnote text-fg-2">
            {node.location ? `${flag(node.countryCode)} ${node.location} · ` : ""}
            {node.notes} {node.notes === 1 ? "note" : "notes"}
          </p>
          {node.circle && (
            <div className="mt-1.5">
              <CircleBadge circle={node.circle} />
            </div>
          )}
        </div>
      </div>
      {own.length > 0 && (
        <ul className="mt-4 flex flex-col">
          {own.map((l, i) => {
            const other = l.source === node.id ? l.target : l.source;
            const label = linkLabel(l, node.id, nameOf);
            const dot = l.kind === "introduced" ? "bg-accent" : l.kind === "mention" ? "bg-warm-inner" : "bg-fg-4";
            const body = (
              <>
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </>
            );
            return (
              <li key={`${l.kind}-${other}-${i}`}>
                {other !== "me" ? (
                  <button
                    type="button"
                    onClick={() => onSelect(other)}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2 text-left text-subhead text-fg transition-colors hover:bg-fill-1 active:bg-fill-2"
                  >
                    {body}
                    <ChevronRight size={15} strokeWidth={2.4} className="shrink-0 text-fg-4" aria-hidden />
                  </button>
                ) : (
                  <div className="flex min-h-11 items-center gap-2.5 px-2 text-subhead text-fg-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
